/** AI 요약 새로고침·최근 수정 시각·미리보기 대본 (DATABASE_URL 필요) */
import { HttpException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import type { AiJobsQueue } from './ai-jobs.queue.js';
import { isSummaryPending, ScriptsService } from './scripts.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

describe('isSummaryPending', () => {
  const at = (iso: string) => new Date(iso);
  it('요청이 없으면 대기 아님', () => {
    expect(isSummaryPending({ aiSummary: null, aiSummaryRequestedAt: null })).toBe(false);
  });
  it('요청 후 요약이 없거나 더 오래되면 대기 중', () => {
    expect(isSummaryPending({ aiSummary: null, aiSummaryRequestedAt: at('2026-10-11T00:00:00Z') })).toBe(true);
    expect(
      isSummaryPending({
        aiSummary: { generatedAt: '2026-10-11T00:00:00Z' },
        aiSummaryRequestedAt: at('2026-10-11T00:00:05Z'),
      }),
    ).toBe(true);
  });
  it('요청 이후에 만들어진 요약이 있으면 끝남', () => {
    expect(
      isSummaryPending({
        aiSummary: { generatedAt: '2026-10-11T00:00:06Z' },
        aiSummaryRequestedAt: at('2026-10-11T00:00:05Z'),
      }),
    ).toBe(false);
  });
});

run('AI 요약·미리보기 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let queueOk = true;
  const queued: string[] = [];
  let scripts: ScriptsService;
  let writer: Viewer, producer: Viewer, member: Viewer;
  const userIds: string[] = [];

  async function makeUser(name: string, roles: Array<'WRITER' | 'PRODUCER'>): Promise<Viewer> {
    const u = await prisma.user.create({
      data: { email: `${name}-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  /** 워커가 요약을 저장한 것처럼 흉내낸다 */
  const fakeWorker = (id: string) =>
    prisma.script.update({
      where: { id },
      data: { aiSummary: { summary: 's', tags: [], contentRating: 'ALL', model: 'test', generatedAt: new Date().toISOString() } },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    const queue = {
      enqueueSummarize: async (id: string) => {
        if (queueOk) queued.push(id);
        return queueOk;
      },
    } as AiJobsQueue;
    scripts = new ScriptsService(prisma, queue);
    writer = await makeUser('sp-writer', ['WRITER']);
    producer = await makeUser('sp-producer', ['PRODUCER']);
    member = await makeUser('sp-member', []);
  });

  afterAll(async () => {
    await prisma.script.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('내용이 바뀔 때마다 요약을 다시 요청하고, 상태 변경은 수정 시각에 넣지 않는다', async () => {
    const s = await scripts.create(writer, {
      title: '요약 테스트', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'v1', rightsDeclared: true,
    });
    expect(queued).toContain(s.id);
    expect(s.aiSummaryPending).toBe(true);

    await fakeWorker(s.id);
    const done = await scripts.get(s.id, writer);
    expect(done.aiSummaryPending).toBe(false);

    // 공개는 내용 변경이 아니다
    await new Promise((r) => setTimeout(r, 10));
    const published = await scripts.publish(s.id, writer, {});
    expect(published.contentUpdatedAt).toEqual(done.contentUpdatedAt);
    expect(published.aiSummaryPending).toBe(false);

    // 같은 값으로 저장하면 아무 일도 없다
    const before = queued.length;
    await scripts.update(s.id, writer, { logline: 'l' });
    expect(queued.length).toBe(before);

    // 내용 변경 → 수정 시각 갱신 + 새 요약 요청
    const edited = await scripts.update(s.id, writer, { fullText: 'v2' });
    expect(queued.length).toBe(before + 1);
    expect(edited.aiSummaryPending).toBe(true);
    expect(new Date(edited.contentUpdatedAt).getTime()).toBeGreaterThan(new Date(done.contentUpdatedAt).getTime());

    // 생성 중에 바로 새로고침하면 429, 끝난 뒤에는 가능
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(HttpException);
    await fakeWorker(s.id);
    const refreshed = await scripts.refreshSummary(s.id, writer);
    expect(refreshed.aiSummaryPending).toBe(true);
    await expect(scripts.refreshSummary(s.id, producer)).rejects.toThrow();
  });

  it('큐 등록에 실패하면 "생성 중"으로 남지 않는다', async () => {
    queueOk = false;
    const s = await scripts.create(writer, {
      title: '큐 실패', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'x',
    });
    expect(s.aiSummaryPending).toBe(false);
    expect(s.aiSummaryRequestedAt).toBeNull();
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(HttpException);
    queueOk = true;
  });

  it('미리보기는 작가와 공개 대본을 보는 영상 제작자에게만 보인다', async () => {
    const s = await scripts.create(writer, {
      title: '미리보기', logline: 'l', synopsis: 's', genre: '드라마', fullText: '전문 전체', rightsDeclared: true,
      previewText: '  S#1. 일부분\r\n',
    });
    expect(s.previewText).toBe('S#1. 일부분');
    // 공개 전에는 작가만
    await expect(scripts.get(s.id, producer)).rejects.toThrow(NotFoundException);
    await scripts.publish(s.id, writer, {});

    const asProducer = await scripts.get(s.id, producer);
    expect(asProducer.previewText).toBe('S#1. 일부분');
    expect(asProducer.fullText).toBeNull();
    expect(asProducer.viewer.canReadPreview).toBe(true);

    const asMember = await scripts.get(s.id, member);
    expect(asMember.previewText).toBeNull();
    expect((await scripts.get(s.id, null)).previewText).toBeNull();

    // 미리보기만 바꾸면 수정 시각은 갱신되지만 요약은 다시 만들지 않는다
    const before = queued.length;
    const updated = await scripts.update(s.id, writer, { previewText: 'S#2. 다른 부분' });
    expect(updated.previewText).toBe('S#2. 다른 부분');
    expect(queued.length).toBe(before);
    // 빈 문자열이면 미리보기 없음
    expect((await scripts.update(s.id, writer, { previewText: '' })).previewText).toBeNull();
    expect((await scripts.get(s.id, producer)).previewText).toBeNull();
  });
});
