/**
 * 출연자 등록을 HTTP 레벨에서 확인한다: 가입 → 출연자 프로필 → 본인인증 → 얼굴 스캔 업로드(multipart)
 * → 셀카 확인 → 동의 → 캐스팅 목록, 원본 내려받기 권한, 관리자 전용 경로 (DATABASE_URL 필요).
 * 출연자 기능은 FEATURE_CASTING=on일 때만 올라가므로, 환경 변수를 먼저 정하고 AppModule을 동적으로 가져온다.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { POLICY_VERSION } from '../src/modules/talent/likeness-policy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('출연자 등록 e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);
  const email = (name: string) => `e2e-talent-${name}-${suffix}@test.local`;
  const createdUserIds = new Set<string>();

  beforeAll(async () => {
    process.env.AI_JOBS_DISABLED = 'true';
    process.env.FEATURE_CASTING = 'on';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const ids = [...createdUserIds];
    await prisma.likenessAccessLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.talentProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
    delete process.env.FEATURE_CASTING;
  });

  async function signup(name: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: email(name), password: 'password1234', displayName: name })
      .expect(201);
    createdUserIds.add(res.body.user.id);
    return { id: res.body.user.id as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
  }

  it('가입한 일반 계정이 출연자로 등록을 마치고, 원본은 본인만 받는다', async () => {
    const http = request(app.getHttpServer());
    await http.get('/talent/me').expect(401);
    const actor = await signup('actor');
    const A = actor.auth;

    expect((await http.get('/talent/me').set(A).expect(200)).body).toEqual({});
    const created = await http
      .post('/talent/profile')
      .set(A)
      .send({ kind: 'GENERAL', stageName: '한별', allowedTags: ['ROMANCE'], minFeeKrw: 100000 })
      .expect(201);
    expect(created.body).toMatchObject({ status: 'PENDING_VERIFICATION', missingSteps: ['IDENTITY', 'FACE_SCAN', 'LIVENESS', 'CONSENT'] });
    await http.post('/talent/profile').set(A).send({ kind: 'GENERAL', stageName: 'x', allowedTags: [] }).expect(409);

    await http.post('/identity-verification').set(A).send({ token: 'garbage' }).expect(400);
    await http.post('/identity-verification').set(A).send({ token: 'test:김한별:1995-05-05' }).expect(200);

    const face = await http
      .post('/talent/me/assets')
      .set(A)
      .field('kind', 'FACE_SCAN')
      .attach('file', Buffer.from('face'), { filename: 'face.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await http
      .post('/talent/me/liveness')
      .set(A)
      .attach('selfie', Buffer.from('MISMATCH'), { filename: 's.jpg', contentType: 'image/jpeg' })
      .expect(400);
    await http.post('/talent/me/liveness').set(A).attach('selfie', Buffer.from('selfie'), { filename: 's.jpg', contentType: 'image/jpeg' }).expect(200);
    const done = await http.post('/talent/me/consent').set(A).send({ policyVersion: POLICY_VERSION, sensitiveData: true, crossBorder: true }).expect(200);
    expect(done.body).toMatchObject({ status: 'ACTIVE', missingSteps: [] });

    const directory = (await http.get('/talent').set(A).expect(200)).body as Array<{ id: string }>;
    expect(directory.map((t) => t.id)).toContain(done.body.id);
    expect(JSON.stringify(directory)).not.toContain('김한별');

    const download = await http.get(`/likeness/assets/${face.body.id}/content`).set(A).expect(200);
    expect(Buffer.from(download.body).toString()).toBe('face');
    const other = await signup('other');
    await http.get(`/likeness/assets/${face.body.id}/content`).set(other.auth).expect(404);
    expect((await http.get('/talent/me/access-logs').set(A).expect(200)).body).toEqual([expect.objectContaining({ purpose: 'SELF' })]);

    // 관리자 전용 경로
    await http.get('/admin/talent/guardian-checks').set(A).expect(403);
    await http.post('/admin/takedowns/x/decide').set(A).send({ uphold: true, resolution: 'x' }).expect(403);
  });
});
