/**
 * 흥행 판단 모델 1단계 통합 테스트 (실제 PostgreSQL 필요): 학습 동의, 커버리지 점수 숨김,
 * 작품 성과 기록 권한, 학습용 데이터(동의한 대본만, 원문 없음).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Viewer } from '../../access/access-rules.js';
import { AiJobsQueue } from '../../scripts/ai-jobs.queue.js';
import { ScriptsService } from '../../scripts/scripts.service.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { PerformanceService } from '../performance.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const COVERAGE = {
  scores: { hook: 4, conflict: 3, characters: 4, pacing: 3, dialogue: 3 },
  productionDifficulty: 2,
  estimatedCast: 3,
  estimatedLocations: 2,
  strengths: ['첫 장면에서 바로 사건이 시작된다'],
  risks: [],
  comparableTitles: [],
};

run('흥행 모델 1단계 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let scripts: ScriptsService;
  let performance: PerformanceService;
  const userIds: string[] = [];
  let seq = 0;

  async function makeUser(name: string, roles: Array<'ADMIN'> = []): Promise<Viewer> {
    seq++;
    const u = await prisma.user.create({
      data: { email: `${name}${seq}-hm-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles, coinBalance: 100 },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  /** 공개된 대본 + 딜 + 작품 하나 (출연 계약 없이 직접 만든다) */
  async function publishedWork(writer: Viewer, producer: Viewer, trainingConsent: boolean) {
    const script = await prisma.script.create({
      data: {
        authorId: writer.id, title: '성과 대본', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'S#1. 집 (밤)\n본문',
        status: 'PUBLISHED', rightsDeclared: true, trainingConsent,
        aiSummary: { summary: '요약', tags: [], contentRating: 'ALL', coverage: COVERAGE, model: 'test', generatedAt: new Date().toISOString() },
      },
    });
    const n = await prisma.negotiation.create({ data: { scriptId: script.id, writerId: writer.id, producerId: producer.id, status: 'AGREED' } });
    const o = await prisma.offer.create({
      data: { negotiationId: n.id, proposerId: producer.id, writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 0, termMonths: 12, exclusive: false, status: 'ACCEPTED' },
    });
    const deal = await prisma.deal.create({ data: { negotiationId: n.id, acceptedOfferId: o.id } });
    const project = await prisma.project.create({ data: { dealId: deal.id, title: '작품' } });
    const work = await prisma.work.create({ data: { projectId: project.id, title: '1화', contentTags: [], status: 'PUBLISHED', publishedAt: new Date(Date.now() - 10 * 86_400_000) } });
    return { script, work };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    const queue = { enqueueSummarize: async () => true } as unknown as AiJobsQueue;
    scripts = new ScriptsService(prisma, queue, new WalletService(prisma));
    performance = new PerformanceService(prisma);
  });

  afterAll(async () => {
    const scriptIds = (await prisma.script.findMany({ where: { authorId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
    const dealIds = (await prisma.deal.findMany({ where: { negotiation: { scriptId: { in: scriptIds } } }, select: { id: true } })).map((d) => d.id);
    await prisma.project.deleteMany({ where: { dealId: { in: dealIds } } }); // 작품·성과 기록은 함께 지워진다
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.offer.deleteMany({ where: { negotiation: { scriptId: { in: scriptIds } } } });
    await prisma.negotiation.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('학습 동의는 선택이고 기본은 동의 안 함, 수정으로 켜고 끌 수 있다', async () => {
    const writer = await makeUser('writer');
    const created = await scripts.create(writer, { title: 't', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'f' });
    expect(created.trainingConsent).toBe(false);
    expect((await scripts.update(created.id, writer, { trainingConsent: true })).trainingConsent).toBe(true);
    expect((await prisma.script.findUniqueOrThrow({ where: { id: created.id } })).trainingConsentAt).not.toBeNull();
    expect((await scripts.update(created.id, writer, { trainingConsent: false })).trainingConsent).toBe(false);
    expect((await prisma.script.findUniqueOrThrow({ where: { id: created.id } })).trainingConsentAt).toBeNull();
  });

  it('커버리지 점수는 다른 사람에게만 보이고, 작가 본인·비로그인·목록에서는 빠진다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const { script } = await publishedWork(writer, producer, false);

    const forProducer = await scripts.get(script.id, producer);
    expect(forProducer.aiSummary?.coverage?.scores).toEqual(COVERAGE.scores);
    const forAuthor = await scripts.get(script.id, writer);
    expect(forAuthor.aiSummary?.coverage?.scores).toBeUndefined();
    expect(forAuthor.aiSummary?.coverage?.strengths).toEqual(COVERAGE.strengths); // 의견은 작가도 본다
    expect((await scripts.get(script.id, null)).aiSummary?.coverage?.scores).toBeUndefined();
    const listed = (await scripts.list({ mine: true }, writer)).items.find((s) => s.id === script.id);
    expect(listed?.aiSummary?.coverage?.scores).toBeUndefined();
  });

  it('성과는 기획사·관리자가 공개한 작품에만 기록하고, 외부인은 못 본다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const outsider = await makeUser('outsider');
    const admin = await makeUser('admin', ['ADMIN']);
    const { work } = await publishedWork(writer, producer, true);

    const snap = await performance.record(producer, work.id, { capturedAt: new Date(), views: 12_000, avgViewDurationSec: 95, subscribersGained: 40 });
    expect(snap).toMatchObject({ views: 12_000, avgViewDurationSec: 95, source: 'MANUAL' });
    await performance.record(admin, work.id, { capturedAt: new Date(), views: 15_000 });
    await expect(performance.record(outsider, work.id, { capturedAt: new Date(), views: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect((await performance.list(writer, work.id)).map((s) => s.views)).toEqual([12_000, 15_000]);
    await expect(performance.list(outsider, work.id)).rejects.toBeInstanceOf(NotFoundException);

    const draft = await prisma.work.create({ data: { projectId: work.projectId, title: '2화', contentTags: [] } });
    await expect(performance.record(producer, draft.id, { capturedAt: new Date(), views: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('학습용 데이터에는 동의한 대본만, 원문 없이 커버리지와 최근 성과만 들어간다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const consented = await publishedWork(writer, producer, true);
    const refused = await publishedWork(writer, producer, false);
    await performance.record(producer, consented.work.id, { capturedAt: new Date(), views: 3_000 });

    const rows = await performance.trainingSet();
    expect(rows.some((r) => r.scriptId === refused.script.id)).toBe(false);
    const row = rows.find((r) => r.scriptId === consented.script.id)!;
    expect(row).toMatchObject({ genre: '드라마', contentRating: 'ALL', coverage: COVERAGE, summaryModel: 'test' });
    expect(row.works).toEqual([expect.objectContaining({ workId: consented.work.id, daysSincePublish: 10 })]);
    expect(row.works[0]!.latest?.views).toBe(3_000);
    expect(JSON.stringify(row)).not.toContain('본문');
  });
});
