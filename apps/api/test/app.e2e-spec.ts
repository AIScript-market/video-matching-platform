/**
 * 실제 AppModule + 인증으로 전체 흐름을 HTTP 레벨에서 확인한다 (DATABASE_URL 필요, 시드 관리자 사용).
 * Redis 없이 돌도록 요약 작업 등록은 끈다.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);
  const email = (name: string) => `e2e-${name}-${suffix}@test.local`;
  const createdUserIds = new Set<string>();

  beforeAll(async () => {
    process.env.AI_JOBS_DISABLED = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const ids = [...createdUserIds];
    const scripts = (await prisma.script.findMany({ where: { authorId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    const negs = (
      await prisma.negotiation.findMany({
        where: { OR: [{ scriptId: { in: scripts } }, { producerId: { in: ids } }] },
        select: { id: true },
      })
    ).map((n) => n.id);
    const deals = (await prisma.deal.findMany({ where: { negotiationId: { in: negs } }, select: { id: true } })).map((d) => d.id);
    await prisma.contract.deleteMany({ where: { OR: [{ dealId: { in: deals } }, { parties: { some: { userId: { in: ids } } } }] } });
    await prisma.ledgerEntry.deleteMany({ where: { dealId: { in: deals } } });
    await prisma.license.deleteMany({ where: { dealId: { in: deals } } });
    await prisma.deal.deleteMany({ where: { id: { in: deals } } });
    await prisma.message.deleteMany({ where: { negotiationId: { in: negs } } });
    await prisma.offer.deleteMany({ where: { negotiationId: { in: negs } } });
    await prisma.negotiation.deleteMany({ where: { id: { in: negs } } });
    await prisma.scriptAccessLog.deleteMany({ where: { OR: [{ scriptId: { in: scripts } }, { userId: { in: ids } }] } });
    await prisma.scriptAccessRequest.deleteMany({ where: { OR: [{ scriptId: { in: scripts } }, { producerId: { in: ids } }] } });
    await prisma.scriptPreviewUnlock.deleteMany({ where: { OR: [{ scriptId: { in: scripts } }, { userId: { in: ids } }] } });
    await prisma.scriptUpload.deleteMany({ where: { OR: [{ scriptId: { in: scripts } }, { uploaderId: { in: ids } }] } });
    await prisma.script.deleteMany({ where: { id: { in: scripts } } });
    await prisma.accountReport.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { targetId: { in: ids } }] } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  /** 일반 가입 → (선택) 프로필 공개 */
  async function signup(name: string, opts: { creator?: boolean } = {}) {
    const http = request(app.getHttpServer());
    const res = await http
      .post('/auth/signup')
      .send({ email: email(name), password: 'password1234', displayName: name })
      .expect(201);
    createdUserIds.add(res.body.user.id);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    if (opts.creator) {
      await http.patch('/me/profile').set(auth).send({ bio: `${name} 소개`, profilePublic: true }).expect(204);
    }
    return { id: res.body.user.id as string, auth, user: res.body.user };
  }

  async function adminAuth() {
    const http = request(app.getHttpServer());
    const res = await http.post('/auth/login').send({ email: 'admin@vmp.dev', password: 'admin1234!' }).expect(200);
    return { Authorization: `Bearer ${res.body.accessToken}` };
  }

  it('일반 가입 → 프로필 공개 → 대본 공개 → 열람 → 협상(메시지 코인) → 수락 → 장부', async () => {
    const http = request(app.getHttpServer());
    const ADMIN = await adminAuth();

    // 가입: 일반 계정 + 가입 보너스 10코인
    await http.post('/auth/signup').send({ email: 'bad', password: 'short', displayName: '' }).expect(400);
    const writer = await signup('writer');
    expect(writer.user).toMatchObject({ roles: [], coinBalance: 10, creatorReady: false });
    await http.post('/auth/signup').send({ email: email('writer'), password: 'password1234', displayName: '중복' }).expect(409);
    // 예전 roles 같은 필드는 받지 않는다
    await http.post('/auth/signup').send({ email: email('x'), password: 'password1234', displayName: 'x', roles: ['ADMIN'] }).expect(400);

    // 로그인: 틀린 비밀번호 401, 쿠키 인증
    await http.post('/auth/login').send({ email: email('writer'), password: 'wrong-password' }).expect(401);
    const login = await http.post('/auth/login').send({ email: email('writer').toUpperCase(), password: 'password1234' }).expect(200);
    const W = { Cookie: (login.headers['set-cookie'] as unknown as string[]).join('; ') };
    expect((await http.get('/me').set(W).expect(200)).body.passwordHash).toBeUndefined();
    await http.get('/me').expect(401);

    // 프로필을 공개하기 전에는 대본 작성 불가
    const blocked = await http.post('/scripts').set(W).send({ title: 't', logline: 'l', synopsis: 's', genre: 'g', fullText: 'f' }).expect(403);
    expect(blocked.body.error).toBe('PROFILE_NOT_PUBLIC');
    await http.patch('/me/profile').set(W).send({ profilePublic: true }).expect(400); // 소개 없이 공개 불가
    await http.get(`/users/${writer.id}`).expect(404); // 비공개 프로필
    await http.patch('/me/profile').set(W).send({ bio: '미스터리 작가입니다', profilePublic: true }).expect(204);
    // 이메일은 공개하지 않아도 된다 (계약 전 연락은 플랫폼 메시지로만)
    expect((await http.get('/me').set(W)).body.creatorReady).toBe(true);
    expect((await http.get(`/users/${writer.id}`).expect(200)).body).toMatchObject({ email: null, creatorReady: true });
    await http.patch('/me/profile').set(W).send({ emailPublic: true }).expect(204);
    const profile = (await http.get(`/users/${writer.id}`).expect(200)).body;
    expect(profile).toMatchObject({ bio: '미스터리 작가입니다', email: email('writer'), creatorReady: true });

    const producer = await signup('producer', { creator: true });
    const P = producer.auth;
    const member = await signup('member'); // 프로필 비공개

    // 대본 작성·공개
    const script = await http.post('/scripts').set(W).send({ title: 'E2E 대본', logline: '로그라인', synopsis: '시놉시스', genre: '스릴러', fullText: '전문입니다' }).expect(201);
    await http.post(`/scripts/${script.body.id}/publish`).set(W).send({}).expect(400);
    await http.post(`/scripts/${script.body.id}/publish`).set(W).send({ rightsDeclared: true }).expect(201);
    expect((await http.get(`/scripts/${script.body.id}`).expect(200)).body.fullText).toBeNull();

    // 프로필 비공개 계정은 열람 요청 불가 → 공개한 계정은 가능
    await http.post(`/scripts/${script.body.id}/access-requests`).set(member.auth).send({ ndaAccepted: true }).expect(403);
    const ar = await http.post(`/scripts/${script.body.id}/access-requests`).set(P).send({ ndaAccepted: true }).expect(201);
    await http.post(`/access-requests/${ar.body.id}/approve`).set(W).expect(200);
    expect((await http.get(`/scripts/${script.body.id}`).set(P).expect(200)).body.fullText).toBe('전문입니다');

    // 협상: 메시지 1건 = 1코인 (제작자 10코인)
    const neg = await http.post(`/scripts/${script.body.id}/negotiations`).set(P).expect(201);
    for (let i = 0; i < 10; i++) {
      await http.post(`/negotiations/${neg.body.id}/messages`).set(P).send({ body: `메시지 ${i}` }).expect(201);
    }
    const broke = await http.post(`/negotiations/${neg.body.id}/messages`).set(P).send({ body: '하나 더' }).expect(402);
    expect(broke.body).toMatchObject({ error: 'INSUFFICIENT_COINS', required: 1, balance: 0 });
    expect((await http.get(`/negotiations/${neg.body.id}/messages`).set(P)).body).toHaveLength(10); // 실패한 메시지는 안 남는다

    // 코인 구매 (테스트 결제) → 다시 메시지
    const wallet = (await http.get('/coins').set(P).expect(200)).body;
    expect(wallet).toMatchObject({ balance: 0, prices: { MESSAGE: 1, PREVIEW_UNLOCK: 3, SCRIPT_UPLOAD: 5 }, testPayments: true });
    await http.post('/coins/purchase').set(P).send({ packageId: 'nope' }).expect(400);
    expect((await http.post('/coins/purchase').set(P).send({ packageId: 'coins_10' }).expect(200)).body.balance).toBe(10);
    await http.post(`/negotiations/${neg.body.id}/messages`).set(P).send({ body: '충전했어요' }).expect(201);
    const history = (await http.get('/coins/transactions').set(P).expect(200)).body.items;
    expect(history[0]).toMatchObject({ type: 'SPEND', use: 'MESSAGE', amount: -1, balanceAfter: 9 });
    expect(history[1]).toMatchObject({ type: 'PURCHASE', amount: 10, priceKrw: 1000 });
    expect(history.at(-1)).toMatchObject({ type: 'SIGNUP_BONUS', amount: 10 });

    // 제안·역제안·수락 (제안은 코인을 쓰지 않는다)
    const offer = await http.post(`/negotiations/${neg.body.id}/offers`).set(P).send({ writerSharePct: 55, producerSharePct: 45, upfrontFeeKrw: 2000000, termMonths: 18, exclusive: true }).expect(201);
    const counter = await http.post(`/negotiations/${neg.body.id}/offers`).set(W).send({ writerSharePct: 60, producerSharePct: 40, upfrontFeeKrw: 3000000, termMonths: 18, exclusive: true }).expect(201);
    await http.post(`/offers/${offer.body.id}/accept`).set(W).expect(409);
    const accepted = await http.post(`/offers/${counter.body.id}/accept`).set(P).expect(200);

    // 장부: 관리자만 기록
    await http.post(`/deals/${accepted.body.dealId}/ledger`).set(W).send({ type: 'REVENUE', amountKrw: 1000 }).expect(403);
    await http.post(`/deals/${accepted.body.dealId}/ledger`).set(ADMIN).send({ type: 'REVENUE', amountKrw: 1000 }).expect(201);
    expect((await http.get(`/deals/${accepted.body.dealId}/ledger`).set(P).expect(200)).body.totals.balance).toBe(1000);
    await http.get('/admin/users').set(W).expect(403);

    await http.post('/auth/logout').set(W).expect(204);
  });

  it('업로드·미리보기 코인 → 검토 메시지 → 관리자 로그 → 정지 → 탈퇴 후 재가입', async () => {
    const http = request(app.getHttpServer());
    const ADMIN = await adminAuth();
    const writer = await signup('upwriter', { creator: true });
    const producer = await signup('upproducer', { creator: true });
    const W = writer.auth;
    const P = producer.auth;
    const title = `바다의 끝 ${suffix}`;

    // 업로드 1회 = 5코인 (보유 10). 형식 오류는 코인을 쓰지 않는다
    await http.post('/scripts/upload').set(W).attach('file', Buffer.from('x'), 'a.hwp').expect(400);
    const draft = await http
      .post('/scripts/upload')
      .set(W)
      .attach('file', Buffer.from('S#1. 바다 (새벽)\r\n\r\n\r\n해원: 다시 왔어.'), { filename: `${title}.txt`, contentType: 'text/plain' })
      .expect(201);
    expect(draft.body).toMatchObject({ title, status: 'DRAFT', fullText: 'S#1. 바다 (새벽)\n\n해원: 다시 왔어.' });
    await http.post(`/scripts/${draft.body.id}/upload`).set(W).attach('file', Buffer.from('S#1. 바다 (밤)\n해원: 끝이야.'), 'v2.md').expect(201);
    const noCoins = await http.post(`/scripts/${draft.body.id}/preview/upload`).set(W).attach('file', Buffer.from('일부'), 'preview.txt').expect(402);
    expect(noCoins.body.error).toBe('INSUFFICIENT_COINS');
    // 관리자 코인 지급
    expect((await http.post(`/admin/users/${writer.id}/coins`).set(ADMIN).send({ amount: 20, memo: '이벤트' }).expect(200)).body.balance).toBe(20);
    await http.post(`/admin/users/${writer.id}/coins`).set(ADMIN).send({ amount: -999 }).expect(400);
    const withPreview = await http.post(`/scripts/${draft.body.id}/preview/upload`).set(W).attach('file', Buffer.from('S#1. 바다 (밤) 일부'), 'preview.txt').expect(201);
    expect(withPreview.body.previewText).toBe('S#1. 바다 (밤) 일부');

    await http.patch(`/scripts/${draft.body.id}`).set(W).send({ logline: '돌아온 해원', synopsis: '시놉시스', genre: '드라마' }).expect(200);
    await http.post(`/scripts/${draft.body.id}/publish`).set(W).send({ rightsDeclared: true }).expect(201);

    // 미리보기: 열람권 전에는 존재만, 3코인으로 열람권 구매
    const before = (await http.get(`/scripts/${draft.body.id}`).set(P).expect(200)).body;
    expect(before).toMatchObject({ previewText: null, previewAvailable: true, fullText: null });
    const unlocked = (await http.post(`/scripts/${draft.body.id}/preview/unlock`).set(P).expect(200)).body;
    expect(unlocked.previewText).toBe('S#1. 바다 (밤) 일부');
    await http.post(`/scripts/${draft.body.id}/preview/unlock`).set(P).expect(200); // 다시 눌러도 추가 차감 없음
    expect((await http.get('/coins').set(P)).body.balance).toBe(7);

    // 검토(전문 열람) 후 메시지 = 1코인
    await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '좋네요' }).expect(403);
    const ar = await http.post(`/scripts/${draft.body.id}/access-requests`).set(P).send({ ndaAccepted: true }).expect(201);
    await http.post(`/access-requests/${ar.body.id}/approve`).set(W).expect(200);
    await http.get(`/scripts/${draft.body.id}`).set(P).expect(200);
    const contact = await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '검토했습니다. 미팅 가능할까요?' }).expect(201);
    expect((await http.get('/coins').set(P)).body.balance).toBe(6);

    // 관리자 로그: 메시지·열람·업로드·코인
    const q = (s: string) => encodeURIComponent(s);
    expect((await http.get(`/admin/logs/messages?q=${q(title)}`).set(ADMIN).expect(200)).body.items.map((m: { body: string }) => m.body)).toEqual(['검토했습니다. 미팅 가능할까요?']);
    expect((await http.get(`/admin/logs/views?q=${q(email('upproducer'))}`).set(ADMIN).expect(200)).body.items).toHaveLength(1);
    const uploads = (await http.get(`/admin/logs/uploads?q=${q(email('upwriter'))}`).set(ADMIN).expect(200)).body.items;
    expect(uploads.map((u: { kind: string; filename: string }) => `${u.kind}:${u.filename}`)).toEqual(['PREVIEW:preview.txt', 'FULL:v2.md', `FULL:${title}.txt`]);
    const coinLog = (await http.get(`/admin/logs/coins?q=${q(email('upproducer'))}`).set(ADMIN).expect(200)).body.items;
    expect(coinLog.map((c: { type: string; use: string | null }) => `${c.type}:${c.use ?? '-'}`)).toEqual(['SPEND:MESSAGE', 'SPEND:PREVIEW_UNLOCK', 'SIGNUP_BONUS:-']);
    await http.get('/admin/logs/coins').set(W).expect(403);

    // 정지: 관리자는 일반 계정만 정지할 수 있다
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@vmp.dev' } });
    await http.patch(`/admin/users/${admin.id}/status`).set(ADMIN).send({ status: 'SUSPENDED' }).expect(400);
    await http.patch(`/admin/users/${producer.id}/status`).set(W).send({ status: 'SUSPENDED' }).expect(403);
    const suspended = await http.patch(`/admin/users/${producer.id}/status`).set(ADMIN).send({ status: 'SUSPENDED', reason: '스팸' }).expect(200);
    expect(suspended.body).toMatchObject({ status: 'SUSPENDED', suspendReason: '스팸' });
    expect((await http.get('/me').set(P).expect(403)).body.error).toBe('ACCOUNT_SUSPENDED');
    const blockedLogin = await http.post('/auth/login').send({ email: email('upproducer'), password: 'password1234' }).expect(403);
    expect(blockedLogin.body.message).toContain('스팸');
    const blockedSignup = await http.post('/auth/signup').send({ email: email('upproducer'), password: 'password1234', displayName: '재가입' }).expect(403);
    expect(blockedSignup.body.error).toBe('SUSPENDED_EMAIL');
    await http.patch(`/admin/users/${producer.id}/status`).set(ADMIN).send({ status: 'ACTIVE' }).expect(200);
    await http.get('/me').set(P).expect(200);

    // 탈퇴: 비밀번호 확인 → 공개 대본 내림 → 같은 이메일로 재가입 가능
    await http.delete('/me').set(W).send({ password: 'wrong-password' }).expect(401);
    await http.delete('/me').set(W).send({ password: 'password1234' }).expect(204);
    await http.get('/me').set(W).expect(401);
    await http.post('/auth/login').send({ email: email('upwriter'), password: 'password1234' }).expect(401);
    await http.get(`/scripts/${draft.body.id}`).expect(404);
    const negotiation = (await http.get(`/negotiations/${contact.body.negotiationId}`).set(P).expect(200)).body;
    expect(negotiation.status).toBe('CLOSED');
    const again = await http.post('/auth/signup').send({ email: email('upwriter'), password: 'password1234', displayName: '다시' }).expect(201);
    createdUserIds.add(again.body.user.id);
    expect(again.body.user).toMatchObject({ coinBalance: 10, creatorReady: false });
    expect(again.body.user.id).not.toBe(writer.id);
  });

  it('계정 신고 → 관리자: 신고된 계정·신고 목록 → 기각·정지하고 처리', async () => {
    const http = request(app.getHttpServer());
    const ADMIN = await adminAuth();
    const bad = await signup('reported', { creator: true });
    const r1 = await signup('reporter1');
    const r2 = await signup('reporter2');
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@vmp.dev' } });

    // 신고 접수와 제한
    await http.post(`/users/${bad.id}/reports`).send({ reason: 'SPAM' }).expect(401);
    const first = await http.post(`/users/${bad.id}/reports`).set(r1.auth).send({ reason: 'SPAM', details: '홍보 메시지를 반복해서 보냄' }).expect(201);
    expect(first.body).toMatchObject({ reason: 'SPAM', status: 'OPEN' });
    await http.post(`/users/${bad.id}/reports`).set(r1.auth).send({ reason: 'ABUSE' }).expect(409);
    await http.post(`/users/${r1.id}/reports`).set(r1.auth).send({ reason: 'SPAM' }).expect(400);
    await http.post(`/users/${admin.id}/reports`).set(r1.auth).send({ reason: 'SPAM' }).expect(400);
    await http.post(`/users/${bad.id}/reports`).set(r2.auth).send({ reason: 'OTHER' }).expect(400);
    await http.post(`/users/${bad.id}/reports`).set(r2.auth).send({ reason: 'NOPE' }).expect(400);
    await http.post('/users/does-not-exist/reports').set(r2.auth).send({ reason: 'SPAM' }).expect(404);
    await http.post(`/users/${bad.id}/reports`).set(r2.auth).send({ reason: 'FRAUD', details: '선급금을 먼저 보내라고 함' }).expect(201);
    // 다른 계정도 한 건 신고 받음 (정렬 확인용)
    await http.post(`/users/${r2.id}/reports`).set(r1.auth).send({ reason: 'ABUSE', details: '욕설' }).expect(201);

    // 관리자만
    await http.get('/admin/reported-users').set(r1.auth).expect(403);
    await http.get('/admin/reports').set(r1.auth).expect(403);

    // 신고된 계정: 많이 신고된 순
    const reported = (await http.get('/admin/reported-users').set(ADMIN).expect(200)).body as Array<{
      user: { id: string }; openCount: number; openReporters: number; reasons: string[];
    }>;
    const mine = reported.filter((r) => [bad.id, r2.id].includes(r.user.id));
    expect(mine.map((r) => r.user.id)).toEqual([bad.id, r2.id]);
    expect(mine[0]).toMatchObject({ openCount: 2, openReporters: 2 });
    expect(mine[0].reasons.sort()).toEqual(['FRAUD', 'SPAM']);

    // 신고 목록 (대상으로 거르기)
    const list = (await http.get(`/admin/reports?targetId=${bad.id}&status=OPEN`).set(ADMIN).expect(200)).body.items;
    expect(list).toHaveLength(2);
    expect(list.map((r: { reporter: { email: string } }) => r.reporter.email).sort()).toEqual([email('reporter1'), email('reporter2')].sort());
    const users = (await http.get(`/admin/users?q=${encodeURIComponent(email('reported'))}`).set(ADMIN).expect(200)).body;
    expect(users[0].openReportCount).toBe(2);

    // 처리: 기각 → 다시 처리 409, 기각하면서 정지는 400
    const [spam, fraud] = [list.find((r: { reason: string }) => r.reason === 'SPAM'), list.find((r: { reason: string }) => r.reason === 'FRAUD')];
    const dismissed = await http.patch(`/admin/reports/${spam.id}`).set(ADMIN).send({ status: 'DISMISSED', note: '일반 홍보 수준' }).expect(200);
    expect(dismissed.body).toMatchObject({ status: 'DISMISSED', resolutionNote: '일반 홍보 수준' });
    expect(dismissed.body.resolvedBy.email).toBe('admin@vmp.dev');
    await http.patch(`/admin/reports/${spam.id}`).set(ADMIN).send({ status: 'RESOLVED' }).expect(409);
    await http.patch(`/admin/reports/${fraud.id}`).set(ADMIN).send({ status: 'DISMISSED', suspend: true }).expect(400);

    // 정지하고 처리 → 계정 정지, 신고된 계정 목록에서 빠짐
    const resolved = await http.patch(`/admin/reports/${fraud.id}`).set(ADMIN).send({ status: 'RESOLVED', suspend: true, note: '사기 시도' }).expect(200);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', target: { status: 'SUSPENDED' } });
    expect((await http.get('/me').set(bad.auth).expect(403)).body.error).toBe('ACCOUNT_SUSPENDED');
    const after = (await http.get('/admin/reported-users').set(ADMIN)).body as Array<{ user: { id: string } }>;
    expect(after.map((r) => r.user.id)).not.toContain(bad.id);
    expect((await http.get(`/admin/users?q=${encodeURIComponent(email('reported'))}`).set(ADMIN)).body[0]).toMatchObject({
      status: 'SUSPENDED', suspendReason: '사기 시도', openReportCount: 0,
    });

    // 처리된 뒤에는 다시 신고할 수 있다
    await http.post(`/users/${bad.id}/reports`).set(r1.auth).send({ reason: 'ABUSE', details: '재신고' }).expect(201);
  });
});
