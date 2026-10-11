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
  const emails = ['w', 'p', 'a'].map((r) => `e2e-${r}-${suffix}@test.local`);

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

  it('가입 → 로그인 → 대본 공개 → 열람 → 협상 → 수락 → 장부', async () => {
    const http = request(app.getHttpServer());

    // 가입: ADMIN 역할은 가입으로 얻을 수 없다
    await http.post('/auth/signup').send({ email: emails[2], password: 'password1234', displayName: 'A', roles: ['ADMIN'] }).expect(400);
    await http.post('/auth/signup').send({ email: 'bad', password: 'short', displayName: '', roles: [] }).expect(400);

    const writerSignup = await http
      .post('/auth/signup')
      .send({ email: emails[0], password: 'password1234', displayName: '작가', roles: ['WRITER'] })
      .expect(201);
    expect(writerSignup.headers['set-cookie']?.[0]).toMatch(/vmp_token=.+HttpOnly/i);
    await http.post('/auth/signup').send({ email: emails[0], password: 'password1234', displayName: '중복', roles: ['WRITER'] }).expect(409);
    await http.post('/auth/signup').send({ email: emails[1], password: 'password1234', displayName: '제작', roles: ['PRODUCER', 'WRITER'] }).expect(201);

    // 로그인: 틀린 비밀번호 401, 쿠키 인증으로 /me
    await http.post('/auth/login').send({ email: emails[0], password: 'wrong-password' }).expect(401);
    const writerLogin = await http.post('/auth/login').send({ email: emails[0].toUpperCase(), password: 'password1234' }).expect(200);
    const writerCookie = writerLogin.headers['set-cookie'] as unknown as string[];
    const me = await http.get('/me').set('Cookie', writerCookie).expect(200);
    expect(me.body).toMatchObject({ email: emails[0], roles: ['WRITER'] });
    expect(me.body.passwordHash).toBeUndefined();
    await http.get('/me').expect(401);
    await http.get('/me').set('Authorization', 'Bearer not-a-token').expect(401);

    const producerToken = (await http.post('/auth/login').send({ email: emails[1], password: 'password1234' }).expect(200)).body.accessToken;
    const W = { Cookie: writerCookie.join('; ') };
    const P = { Authorization: `Bearer ${producerToken}` };

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

    // 장부: 관리자만 기록 (시드 관리자로 로그인)
    const adminToken = (await http.post('/auth/login').send({ email: 'admin@example.com', password: process.env.SEED_PASSWORD ?? 'password1234' })).body.accessToken;
    if (adminToken) {
      const ADMIN = { Authorization: `Bearer ${adminToken}` };
      await http.post(`/deals/${accepted.body.dealId}/ledger`).set(W).send({ type: 'REVENUE', amountKrw: 1000 }).expect(403);
      await http.post(`/deals/${accepted.body.dealId}/ledger`).set(ADMIN).send({ type: 'REVENUE', amountKrw: 1000 }).expect(201);
      expect((await http.get('/admin/users').set(ADMIN).expect(200)).body.length).toBeGreaterThan(0);
      await http.get('/admin/users').set(W).expect(403);
    }
    const ledger = await http.get(`/deals/${accepted.body.dealId}/ledger`).set(P).expect(200);
    expect(ledger.body.totals.balance).toBe(adminToken ? 1000 : 0);

    await http.post('/auth/logout').set(W).expect(204);
  });
});
