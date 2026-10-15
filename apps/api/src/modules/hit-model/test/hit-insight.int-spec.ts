/**
 * 흥행 판단 결과 노출 규칙 통합 테스트 (실제 PostgreSQL 필요). ML 서비스는 가짜로 바꿔 끼운다.
 * 작가 본인 비공개, 비공개 대본 숨김, 추천 후보(공개 대본, 자기 대본 제외), 비슷한 작품 제목 가리기.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Viewer } from '../../access/access-rules.js';
import { HitModelService } from '../hit-model.service.js';
import type { MlClient, MlPrediction, MlRanking } from '../ml.client.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('흥행 판단 노출 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let service: HitModelService;
  const userIds: string[] = [];
  const rankCalls: string[][] = [];
  let neighborIds: string[] = [];
  let seq = 0;

  const fakeMl = {
    predict: async (scriptId: string): Promise<MlPrediction> => ({
      scriptId,
      mode: 'NEIGHBORS',
      embedder: 'hash-ngram-v1-d512',
      trainingPairs: 12,
      requiredPairs: 100,
      neighborSignal: 0.4,
      neighbors: neighborIds.map((id, i) => ({ scriptId: id, similarity: 0.9 - i * 0.1, hit: i === 0, percentile: 0.9 })),
    }),
    rank: async (scriptIds: string[]): Promise<MlRanking> => {
      rankCalls.push(scriptIds);
      return {
        mode: 'MODEL',
        embedder: 'hash-ngram-v1-d512',
        trainingPairs: 120,
        requiredPairs: 100,
        modelVersion: 'hit-test',
        items: [...scriptIds].reverse().map((id, i) => ({ scriptId: id, score: 0.5 - i * 0.01, probability: 0.5 - i * 0.01, low: 0.3, high: 0.6 })),
      };
    },
  } as unknown as MlClient;

  async function makeUser(name: string, roles: Array<'ADMIN'> = []): Promise<Viewer> {
    seq++;
    const u = await prisma.user.create({
      data: { email: `${name}${seq}-hi-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  function makeScript(author: Viewer, status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN', title = `대본-${status}`) {
    return prisma.script.create({
      data: { authorId: author.id, title, logline: 'l', synopsis: 's', genre: '드라마', fullText: 'S#1. 집\n본문', status, rightsDeclared: true },
    });
  }

  beforeAll(() => {
    prisma = new PrismaService();
    service = new HitModelService(prisma, fakeMl);
  });

  afterAll(async () => {
    const scriptIds = (await prisma.script.findMany({ where: { authorId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
    const dealIds = (await prisma.deal.findMany({ where: { negotiation: { scriptId: { in: scriptIds } } }, select: { id: true } })).map((d) => d.id);
    await prisma.project.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.contract.deleteMany({ where: { OR: [{ dealId: { in: dealIds } }, { parties: { some: { userId: { in: userIds } } } }] } });
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.offer.deleteMany({ where: { negotiation: { scriptId: { in: scriptIds } } } });
    await prisma.negotiation.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('작가 본인은 자기 대본의 흥행 판단을 볼 수 없고, 비공개 대본은 남에게 없는 것처럼 보인다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const admin = await makeUser('admin', ['ADMIN']);
    const published = await makeScript(writer, 'PUBLISHED');
    const draft = await makeScript(writer, 'DRAFT');
    neighborIds = [];

    await expect(service.insight(writer, published.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.insight(producer, draft.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.insight(producer, published.id)).mode).toBe('NEIGHBORS');
    expect((await service.insight(admin, draft.id)).trainingPairs).toBe(12);
  });

  it('비슷한 작품에는 첫 공개 작품 제목을 붙이고, 지금 공개가 아닌 대본은 제목을 가린다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const target = await makeScript(writer, 'PUBLISHED');
    const shown = await makeScript(writer, 'PUBLISHED', '공개된 성공작');
    const hidden = await makeScript(writer, 'HIDDEN', '숨긴 대본');
    const n = await prisma.negotiation.create({ data: { scriptId: shown.id, writerId: writer.id, producerId: producer.id, status: 'AGREED' } });
    const o = await prisma.offer.create({
      data: { negotiationId: n.id, proposerId: producer.id, writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 0, termMonths: 12, exclusive: false, status: 'ACCEPTED' },
    });
    const deal = await prisma.deal.create({ data: { negotiationId: n.id, acceptedOfferId: o.id } });
    const project = await prisma.project.create({ data: { dealId: deal.id, title: '작품' } });
    await prisma.work.create({ data: { projectId: project.id, title: '2화', contentTags: [], status: 'PUBLISHED', publishedAt: new Date('2026-09-02') } });
    await prisma.work.create({ data: { projectId: project.id, title: '1화', contentTags: [], status: 'PUBLISHED', publishedAt: new Date('2026-09-01') } });
    neighborIds = [shown.id, hidden.id];

    const insight = await service.insight(producer, target.id);
    expect(insight.neighbors).toEqual([
      expect.objectContaining({ scriptId: shown.id, title: '공개된 성공작', workTitle: '1화', hit: true }),
      expect.objectContaining({ scriptId: hidden.id, title: '비공개 대본', workTitle: null, hit: false }),
    ]);
  });

  it('추천 후보는 공개 대본 중 자기 대본을 뺀 것이고, 모델 순서대로 돌려준다', async () => {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const a = await makeScript(writer, 'PUBLISHED', '추천 A');
    const b = await makeScript(writer, 'PUBLISHED', '추천 B');
    const draft = await makeScript(writer, 'DRAFT');
    const own = await makeScript(producer, 'PUBLISHED', '내 대본');

    const result = await service.recommendations(producer, 50);
    const candidates = rankCalls.at(-1)!;
    expect(candidates).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(candidates).not.toContain(draft.id);
    expect(candidates).not.toContain(own.id);
    expect(result).toMatchObject({ mode: 'MODEL', modelVersion: 'hit-test' });
    const ours = result.items.filter((i) => i.id === a.id || i.id === b.id).map((i) => i.title);
    expect(ours).toEqual(['추천 A', '추천 B']); // 가짜 모델은 후보 순서를 뒤집는다 (후보는 최신순)
    expect(result.items[0]!.authorName).toBeTruthy();
  });
});
