/**
 * BETA_MODE=true로 띄운 AppModule: 숨긴 기능은 404, 코인 구매 403, 초대 코드·성인 확인이 있어야 가입 (DATABASE_URL 필요).
 * 모듈 목록이 가져올 때 정해지므로 환경 변수를 먼저 정하고 AppModule을 동적으로 가져온다.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { betaConfig } from '../src/core/beta.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

describe('betaConfig', () => {
  it('reads codes case-insensitively and defaults the signup coins', () => {
    const c = betaConfig({ BETA_MODE: 'true', BETA_INVITE_CODES: ' Writers-01, PRODUCERS ,' });
    expect(c.enabled).toBe(true);
    expect([...c.inviteCodes]).toEqual(['writers-01', 'producers']);
    expect(c.signupCoins).toBe(100);
    expect(betaConfig({ BETA_SIGNUP_COINS: '30' }).signupCoins).toBe(30);
    expect(betaConfig({}).enabled).toBe(false);
  });
});

run('API e2e (베타 모드)', () => {
  let app: INestApplication;
  const suffix = Date.now().toString(36);
  const email = (name: string) => `beta-${name}-${suffix}@test.local`;
  const created: string[] = [];
  const saved = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, { AI_JOBS_DISABLED: 'true', BETA_MODE: 'true', BETA_INVITE_CODES: 'first-wave', BETA_SIGNUP_COINS: '50' });
    const { AppModule } = await import('../src/app.module.js');
    const { setupApp } = await import('../src/setup-app.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await app.close();
    process.env = saved;
  });

  it('가입에 초대 코드와 성인 확인이 필요하고, 베타 코인을 준다', async () => {
    const http = request(app.getHttpServer());
    const body = { email: email('w'), password: 'password1234', displayName: '베타 작가' };
    expect((await http.post('/auth/signup').send(body).expect(403)).body.error).toBe('INVITE_REQUIRED');
    expect((await http.post('/auth/signup').send({ ...body, inviteCode: 'wrong' }).expect(403)).body.error).toBe('INVITE_REQUIRED');
    expect((await http.post('/auth/signup').send({ ...body, inviteCode: 'FIRST-WAVE' }).expect(400)).body.error).toBe('ADULT_REQUIRED');
    expect((await http.post('/auth/signup').send({ ...body, inviteCode: 'FIRST-WAVE', adultConfirmed: true }).expect(400)).body.error).toBe('TERMS_REQUIRED');
    const res = await http.post('/auth/signup').send({ ...body, inviteCode: 'FIRST-WAVE', adultConfirmed: true, termsAccepted: true }).expect(201);
    created.push(res.body.user.id);
    expect(res.body.user.coinBalance).toBe(50);

    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const wallet = (await http.get('/coins').set(auth).expect(200)).body;
    expect(wallet.purchaseEnabled).toBe(false);
    expect((await http.post('/coins/purchase').set(auth).send({ packageId: 'coins_10' }).expect(403)).body.error).toBe('BETA_NO_PURCHASE');
  });

  it('출연자·캐스팅·흥행 판단 API는 없고, 공개 설정이 그렇게 알려 준다', async () => {
    const http = request(app.getHttpServer());
    expect((await http.get('/config').expect(200)).body).toMatchObject({
      betaMode: true,
      inviteRequired: true,
      purchaseEnabled: false,
      signupCoins: 50,
      features: { talent: false, casting: false, hitModel: false },
    });
    // 기능이 살아 있으면 인증 오류(401)가 나고, 모듈을 올리지 않았으면 404
    await http.get('/talent').expect(404);
    await http.get('/casting/roles').expect(404);
    await http.get('/recommendations/scripts').expect(404);
    await http.get('/health').expect(200);
  });
});
