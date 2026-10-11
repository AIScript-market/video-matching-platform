/**
 * 실제 AppModule + 인증으로 전체 흐름을 HTTP 레벨에서 확인한다 (DATABASE_URL 필요).
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
  const emails = ['w', 'p', 'a', 'w2', 'p2'].map((r) => `e2e-${r}-${suffix}@test.local`);

  beforeAll(async () => {
    process.env.AI_JOBS_DISABLED = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const scripts = (await prisma.script.findMany({ where: { authorId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    const negs = (await prisma.negotiation.findMany({ where: { scriptId: { in: scripts } }, select: { id: true } })).map((n) => n.id);
    const deals = (await prisma.deal.findMany({ where: { negotiationId: { in: negs } }, select: { id: true } })).map((d) => d.id);
    await prisma.roleRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.scriptUpload.deleteMany({ where: { uploaderId: { in: ids } } });
    await prisma.ledgerEntry.deleteMany({ where: { dealId: { in: deals } } });
    await prisma.license.deleteMany({ where: { dealId: { in: deals } } });
    await prisma.deal.deleteMany({ where: { id: { in: deals } } });
    await prisma.message.deleteMany({ where: { negotiationId: { in: negs } } });
    await prisma.offer.deleteMany({ where: { negotiationId: { in: negs } } });
    await prisma.negotiation.deleteMany({ where: { id: { in: negs } } });
    await prisma.scriptAccessLog.deleteMany({ where: { scriptId: { in: scripts } } });
    await prisma.scriptAccessRequest.deleteMany({ where: { scriptId: { in: scripts } } });
    await prisma.script.deleteMany({ where: { id: { in: scripts } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('일반 가입 → 권한 신청 → 관리자 승인 → 대본 공개 → 열람 → 협상 → 수락 → 장부', async () => {
    const http = request(app.getHttpServer());
    const ADMIN = {
      Authorization: `Bearer ${(await http.post('/auth/login').send({ email: 'admin@vmp.dev', password: 'admin1234!' }).expect(200)).body.accessToken}`,
    };

    // 가입은 일반 계정으로 시작. ADMIN은 신청할 수 없다
    await http.post('/auth/signup').send({ email: emails[2], password: 'password1234', displayName: 'A', requestedRoles: ['ADMIN'] }).expect(400);
    await http.post('/auth/signup').send({ email: 'bad', password: 'short', displayName: '' }).expect(400);

    const writerSignup = await http
      .post('/auth/signup')
      .send({ email: emails[0], password: 'password1234', displayName: '작가', requestedRoles: ['WRITER'] })
      .expect(201);
    expect(writerSignup.body.user.roles).toEqual([]);
    expect(writerSignup.headers['set-cookie']?.[0]).toMatch(/vmp_token=.+HttpOnly/i);
    await http.post('/auth/signup').send({ email: emails[0], password: 'password1234', displayName: '중복' }).expect(409);
    await http.post('/auth/signup').send({ email: emails[1], password: 'password1234', displayName: '제작' }).expect(201);

    // 로그인: 틀린 비밀번호 401, 쿠키 인증으로 /me
    await http.post('/auth/login').send({ email: emails[0], password: 'wrong-password' }).expect(401);
    const writerLogin = await http.post('/auth/login').send({ email: emails[0].toUpperCase(), password: 'password1234' }).expect(200);
    const writerCookie = writerLogin.headers['set-cookie'] as unknown as string[];
    const W = { Cookie: writerCookie.join('; ') };
    const me = await http.get('/me').set(W).expect(200);
    expect(me.body).toMatchObject({ email: emails[0], roles: [] });
    expect(me.body.passwordHash).toBeUndefined();
    await http.get('/me').expect(401);
    await http.get('/me').set('Authorization', 'Bearer not-a-token').expect(401);

    const producerToken = (await http.post('/auth/login').send({ email: emails[1], password: 'password1234' }).expect(200)).body.accessToken;
    const P = { Authorization: `Bearer ${producerToken}` };

    // 일반 계정은 대본을 쓸 수 없다 → 가입 시 신청한 WRITER를 관리자가 승인
    await http.post('/scripts').set(W).send({ title: 't', logline: 'l', synopsis: 's', genre: 'g', fullText: 'f' }).expect(403);
    const writerReqs = (await http.get('/role-requests/mine').set(W).expect(200)).body;
    expect(writerReqs).toHaveLength(1);
    expect(writerReqs[0]).toMatchObject({ role: 'WRITER', status: 'PENDING' });
    await http.post(`/admin/role-requests/${writerReqs[0].id}/approve`).set(W).expect(403);
    await http.post(`/admin/role-requests/${writerReqs[0].id}/approve`).set(ADMIN).expect(200);
    await http.post(`/admin/role-requests/${writerReqs[0].id}/approve`).set(ADMIN).expect(409);
    expect((await http.get('/me').set(W)).body.roles).toEqual(['WRITER']);
    await http.post('/role-requests').set(W).send({ role: 'WRITER' }).expect(400);

    // 제작자: 가입 후 직접 신청 → 중복 신청 409 → 거절 → 재신청 → 승인
    const pReq = await http.post('/role-requests').set(P).send({ role: 'PRODUCER', message: '제작사 PD' }).expect(201);
    await http.post('/role-requests').set(P).send({ role: 'PRODUCER' }).expect(409);
    await http.post('/role-requests').set(P).send({ role: 'ADMIN' }).expect(400);
    const pending = (await http.get('/admin/role-requests?status=PENDING').set(ADMIN).expect(200)).body;
    expect(pending.map((r: { id: string }) => r.id)).toContain(pReq.body.id);
    await http.post(`/admin/role-requests/${pReq.body.id}/reject`).set(ADMIN).expect(200);
    expect((await http.get('/me').set(P)).body.roles).toEqual([]);
    const pReq2 = await http.post('/role-requests').set(P).send({ role: 'PRODUCER' }).expect(201);
    await http.post(`/admin/role-requests/${pReq2.body.id}/approve`).set(ADMIN).expect(200);
    expect((await http.get('/me').set(P)).body.roles).toEqual(['PRODUCER']);

    // 대본 작성·공개
    const script = await http.post('/scripts').set(W).send({ title: 'E2E 대본', logline: '로그라인', synopsis: '시놉시스', genre: '스릴러', fullText: '전문입니다' }).expect(201);
    await http.post(`/scripts/${script.body.id}/publish`).set(W).send({}).expect(400);
    await http.post(`/scripts/${script.body.id}/publish`).set(W).send({ rightsDeclared: true }).expect(201);
    const anon = await http.get(`/scripts/${script.body.id}`).expect(200);
    expect(anon.body.fullText).toBeNull();

    // 열람 요청·승인
    const ar = await http.post(`/scripts/${script.body.id}/access-requests`).set(P).send({ ndaAccepted: true }).expect(201);
    await http.post(`/access-requests/${ar.body.id}/approve`).set(W).expect(200);
    expect((await http.get(`/scripts/${script.body.id}`).set(P).expect(200)).body.fullText).toBe('전문입니다');

    // 협상·제안·수락
    const neg = await http.post(`/scripts/${script.body.id}/negotiations`).set(P).expect(201);
    await http.post(`/negotiations/${neg.body.id}/messages`).set(P).send({ body: '안녕하세요' }).expect(201);
    const offer = await http.post(`/negotiations/${neg.body.id}/offers`).set(P).send({ writerSharePct: 55, producerSharePct: 45, upfrontFeeKrw: 2000000, termMonths: 18, exclusive: true }).expect(201);
    const counter = await http.post(`/negotiations/${neg.body.id}/offers`).set(W).send({ writerSharePct: 60, producerSharePct: 40, upfrontFeeKrw: 3000000, termMonths: 18, exclusive: true }).expect(201);
    expect((await http.get(`/negotiations/${neg.body.id}`).set(W)).body.offers.map((o: { id: string; status: string }) => o.status)).toEqual(['COUNTERED', 'PROPOSED']);
    await http.post(`/offers/${offer.body.id}/accept`).set(W).expect(409);
    const accepted = await http.post(`/offers/${counter.body.id}/accept`).set(P).expect(200);

    // 장부: 관리자만 기록
    await http.post(`/deals/${accepted.body.dealId}/ledger`).set(W).send({ type: 'REVENUE', amountKrw: 1000 }).expect(403);
    await http.post(`/deals/${accepted.body.dealId}/ledger`).set(ADMIN).send({ type: 'REVENUE', amountKrw: 1000 }).expect(201);
    expect((await http.get('/admin/users').set(ADMIN).expect(200)).body.length).toBeGreaterThan(0);
    await http.get('/admin/users').set(W).expect(403);
    const ledger = await http.get(`/deals/${accepted.body.dealId}/ledger`).set(P).expect(200);
    expect(ledger.body.totals.balance).toBe(1000);

    await http.post('/auth/logout').set(W).expect(204);
  });

  it('대본 업로드 → 제작자 검토 후 메시지 → 관리자 로그', async () => {
    const http = request(app.getHttpServer());
    const ADMIN = {
      Authorization: `Bearer ${(await http.post('/auth/login').send({ email: 'admin@vmp.dev', password: 'admin1234!' })).body.accessToken}`,
    };
    // 권한을 신청하며 가입 → 관리자 승인
    async function approvedUser(email: string, role: 'WRITER' | 'PRODUCER') {
      const res = await http.post('/auth/signup').send({ email, password: 'password1234', displayName: role, requestedRoles: [role] }).expect(201);
      const auth = { Authorization: `Bearer ${res.body.accessToken}` };
      const [req] = (await http.get('/role-requests/mine').set(auth)).body;
      await http.post(`/admin/role-requests/${req.id}/approve`).set(ADMIN).expect(200);
      return auth;
    }
    const W = await approvedUser(emails[3], 'WRITER');
    const P = await approvedUser(emails[4], 'PRODUCER');

    // 업로드: 제작자는 못 올리고, 지원하지 않는 형식은 거부
    await http.post('/scripts/upload').set(P).attach('file', Buffer.from('x'), 'a.txt').expect(403);
    await http.post('/scripts/upload').set(W).attach('file', Buffer.from('x'), 'a.hwp').expect(400);
    await http.post('/scripts/upload').set(W).expect(400);

    // 파일로 새 초안 (한글 파일명 → 제목)
    const draft = await http
      .post('/scripts/upload')
      .set(W)
      .attach('file', Buffer.from('S#1. 바다 (새벽)\r\n\r\n\r\n해원: 다시 왔어.'), { filename: `바다의 끝 ${suffix}.txt`, contentType: 'text/plain' })
      .expect(201);
    expect(draft.body).toMatchObject({ title: `바다의 끝 ${suffix}`, status: 'DRAFT', fullText: 'S#1. 바다 (새벽)\n\n해원: 다시 왔어.' });

    // 로그라인·시놉시스·장르가 비어 있으면 공개 불가
    const publishFail = await http.post(`/scripts/${draft.body.id}/publish`).set(W).send({ rightsDeclared: true }).expect(400);
    expect(publishFail.body.message).toContain('로그라인');
    await http.patch(`/scripts/${draft.body.id}`).set(W).send({ logline: '바다로 돌아온 해원', synopsis: '시놉시스', genre: '드라마' }).expect(200);

    // 본문 교체 업로드 → 공개
    const replaced = await http.post(`/scripts/${draft.body.id}/upload`).set(W).attach('file', Buffer.from('S#1. 바다 (밤)\n해원: 끝이야.'), 'v2.md').expect(201);
    expect(replaced.body.fullText).toBe('S#1. 바다 (밤)\n해원: 끝이야.');
    await http.post(`/scripts/${draft.body.id}/upload`).set(P).attach('file', Buffer.from('x'), 'x.txt').expect(404);
    await http.post(`/scripts/${draft.body.id}/publish`).set(W).send({ rightsDeclared: true }).expect(201);

    // 제작자: 열람 승인 전·전문을 보기 전에는 메시지 불가 → 열람 후 메시지
    await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '좋네요' }).expect(403);
    const ar = await http.post(`/scripts/${draft.body.id}/access-requests`).set(P).send({ ndaAccepted: true }).expect(201);
    await http.post(`/access-requests/${ar.body.id}/approve`).set(W).expect(200);
    await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '좋네요' }).expect(403);
    await http.get(`/scripts/${draft.body.id}`).set(P).expect(200); // 전문 검토 (열람 로그 생성)
    await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '   ' }).expect(400);
    await http.post(`/scripts/${draft.body.id}/contact`).set(W).send({ body: '본인' }).expect(403);
    const contact = await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '검토했습니다. 2화 구성이 인상적이에요.' }).expect(201);
    const again = await http.post(`/scripts/${draft.body.id}/contact`).set(P).send({ body: '통화 가능할까요?' }).expect(201);
    expect(again.body.negotiationId).toBe(contact.body.negotiationId);

    // 작가: 협상 목록에서 마지막 메시지 확인
    const negs = (await http.get('/negotiations').set(W).expect(200)).body;
    const neg = negs.find((n: { id: string }) => n.id === contact.body.negotiationId);
    expect(neg.lastMessage.body).toBe('통화 가능할까요?');

    // 관리자 로그: 메시지·열람·업로드
    await http.get('/admin/logs/messages').set(W).expect(403);
    const msgs = (await http.get(`/admin/logs/messages?q=${encodeURIComponent(`바다의 끝 ${suffix}`)}`).set(ADMIN).expect(200)).body;
    expect(msgs.items.map((m: { body: string }) => m.body)).toEqual(['통화 가능할까요?', '검토했습니다. 2화 구성이 인상적이에요.']);
    expect(msgs.items[0].recipient.email).toBe(emails[3]);
    expect(msgs.items[0].sender.email).toBe(emails[4]);
    const views = (await http.get(`/admin/logs/views?q=${encodeURIComponent(emails[4])}`).set(ADMIN).expect(200)).body;
    expect(views.items).toHaveLength(1);
    expect(views.items[0].script.title).toBe(`바다의 끝 ${suffix}`);
    const uploads = (await http.get(`/admin/logs/uploads?q=${encodeURIComponent(emails[3])}`).set(ADMIN).expect(200)).body;
    expect(uploads.items.map((u: { filename: string }) => u.filename)).toEqual(['v2.md', `바다의 끝 ${suffix}.txt`]);
    const page1 = (await http.get('/admin/logs/messages?take=1').set(ADMIN).expect(200)).body;
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
  });
});
