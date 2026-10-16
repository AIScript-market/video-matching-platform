/** AI 요약 새로고침·최근 수정 시각·미리보기 대본 (DATABASE_URL 필요) */
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import type { AiJobsQueue } from './ai-jobs.queue.js';
import { WalletService } from '../wallet/wallet.service.js';
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
      data: { email: `${name}-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles, coinBalance: 5 },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  /** 워커가 요약을 저장한 것처럼 흉내낸다 */
  const fakeWorker = (id: string, summary = 's') =>
    prisma.script.update({
      where: { id },
      data: { aiSummary: { summary, tags: [], contentRating: 'ALL', model: 'test', generatedAt: new Date().toISOString() } },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    const queue = {
      enqueueSummarize: async (id: string) => {
        if (queueOk) queued.push(id);
        return queueOk;
      },
    } as AiJobsQueue;
    scripts = new ScriptsService(prisma, queue, new WalletService(prisma));
    writer = await makeUser('sp-writer', ['WRITER']);
    producer = await makeUser('sp-producer', ['PRODUCER']);
    member = await makeUser('sp-member', []);
  });

  afterAll(async () => {
    await prisma.scriptPreviewUnlock.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.scriptAccessLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.script.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('내용이 바뀔 때마다 요약을 다시 요청하고, 상태 변경은 수정 시각에 넣지 않는다', async () => {
    const s = await scripts.create(writer, {
      title: '요약 테스트', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'v1', rightsDeclared: true, aiSummaryConsent: true,
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

    // 소개 글 변경 → 수정 시각 갱신 + 새 요약 요청
    const edited = await scripts.update(s.id, writer, { synopsis: 's2' });
    expect(queued.length).toBe(before + 1);
    expect(edited.aiSummaryPending).toBe(true);
    expect(new Date(edited.contentUpdatedAt).getTime()).toBeGreaterThan(new Date(done.contentUpdatedAt).getTime());

    // 생성 중에 바로 새로고침하면 429, 끝난 뒤에는 가능
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(HttpException);
    await fakeWorker(s.id);
    // 같은 밀리초면 요청이 요약보다 나중이 아니므로, 실제처럼 시간이 조금 흐른 뒤 새로고침한다
    await new Promise((r) => setTimeout(r, 5));
    const refreshed = await scripts.refreshSummary(s.id, writer);
    expect(refreshed.aiSummaryPending).toBe(true);
    await expect(scripts.refreshSummary(s.id, producer)).rejects.toThrow();
  });

  it('큐 등록에 실패하면 "생성 중"으로 남지 않는다', async () => {
    queueOk = false;
    const s = await scripts.create(writer, {
      title: '큐 실패', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'x', aiSummaryConsent: true,
    });
    expect(s.aiSummaryPending).toBe(false);
    expect(s.aiSummaryRequestedAt).toBeNull();
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(HttpException);
    queueOk = true;
  });

  it('AI 요약은 작가가 동의한 대본만, 공개 소개 글이 바뀔 때만 만들고, 누구나 본다', async () => {
    const title = `요약 동의 ${suffix}`;
    // 동의 없이 만들고 공개하면 요약 작업을 보내지 않는다
    const before = queued.length;
    const s = await scripts.create(writer, { title, logline: 'l', synopsis: '형제가 사라진 아버지를 찾는다', genre: '스릴러', fullText: '범인은 형이다', rightsDeclared: true });
    await scripts.publish(s.id, writer, {});
    expect(queued.length).toBe(before);
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(BadRequestException);

    // 동의하면 요약을 요청한다
    expect((await scripts.update(s.id, writer, { aiSummaryConsent: true })).aiSummaryPending).toBe(true);
    expect(queued.length).toBe(before + 1);
    await fakeWorker(s.id, '형제의 추적');

    // 요약은 공개 소개 글로 만들었으므로 시놉시스처럼 누구나 본다
    for (const viewer of [producer, member, null]) expect((await scripts.get(s.id, viewer)).aiSummary?.summary).toBe('형제의 추적');
    expect((await scripts.list({ q: title }, null)).items[0].aiSummary?.summary).toBe('형제의 추적');

    // 전문만 바꾸면 요약을 다시 만들지 않고(전문은 요약에 쓰지 않는다), 시놉시스를 바꾸면 다시 만든다
    await new Promise((r) => setTimeout(r, 5));
    const fullOnly = await scripts.update(s.id, writer, { fullText: '범인은 동생이다' });
    expect(queued.length).toBe(before + 1);
    expect(fullOnly.aiSummaryPending).toBe(false);
    expect((await scripts.update(s.id, writer, { synopsis: '형제가 아버지의 비밀을 쫓는다' })).aiSummaryPending).toBe(true);
    expect(queued.length).toBe(before + 2);

    // 동의를 끄면 요약을 지운다
    const off = await scripts.update(s.id, writer, { aiSummaryConsent: false });
    expect(off).toMatchObject({ aiSummary: null, aiSummaryConsent: false, aiSummaryPending: false });
    expect(queued.length).toBe(before + 2);
  });

  it('요약할 소개 글이 없으면 동의해도 요약하지 않는다 (파일로 만든 빈 초안 등)', async () => {
    const before = queued.length;
    const s = await scripts.create(writer, { title: '빈 소개', logline: ' ', synopsis: '', genre: '드라마', fullText: '본문만 있다', aiSummaryConsent: true });
    expect(queued.length).toBe(before);
    expect(s.aiSummaryPending).toBe(false);
    await expect(scripts.refreshSummary(s.id, writer)).rejects.toThrow(BadRequestException);
    expect((await scripts.update(s.id, writer, { logline: '한 줄 소개' })).aiSummaryPending).toBe(true);
  });

  it('미리보기는 작가 본인과 코인으로 열람권을 산 사람에게만 보인다', async () => {
    const s = await scripts.create(writer, {
      title: '미리보기', logline: 'l', synopsis: 's', genre: '드라마', fullText: '전문 전체', rightsDeclared: true,
      previewText: '  S#1. 일부분\r\n',
    });
    expect(s.previewText).toBe('S#1. 일부분');
    await expect(scripts.get(s.id, producer)).rejects.toThrow(NotFoundException);
    await scripts.publish(s.id, writer, {});

    // 열람권 전: 미리보기가 있다는 것만 안다
    const before = await scripts.get(s.id, producer);
    expect(before).toMatchObject({ previewText: null, previewAvailable: true, fullText: null });
    expect(before.viewer.previewUnlocked).toBe(false);

    // 3코인으로 열람권 구매 (보유 5) → 다시 눌러도 한 번만 차감
    const unlocked = await scripts.unlockPreview(s.id, producer);
    expect(unlocked.previewText).toBe('S#1. 일부분');
    await scripts.unlockPreview(s.id, producer);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: producer.id } })).coinBalance).toBe(2);
    const spends = await prisma.coinTransaction.findMany({ where: { userId: producer.id, use: 'PREVIEW_UNLOCK' } });
    expect(spends).toHaveLength(1);
    expect(spends[0]).toMatchObject({ amount: -3, balanceAfter: 2, refId: s.id });

    // 코인이 모자라면 402, 열람권도 생기지 않는다
    const other = await scripts.create(writer, {
      title: '미리보기2', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'x', rightsDeclared: true, previewText: 'p',
    });
    await scripts.publish(other.id, writer, {});
    await expect(scripts.unlockPreview(other.id, producer)).rejects.toMatchObject({ status: 402 });
    expect((await scripts.get(other.id, producer)).previewText).toBeNull();

    // 일반·비로그인에게도 열람권 없이는 안 보인다
    expect((await scripts.get(s.id, member)).previewText).toBeNull();
    expect((await scripts.get(s.id, null)).previewText).toBeNull();

    // 미리보기만 바꾸면 요약은 다시 만들지 않는다. 빈 문자열이면 미리보기 없음
    const n = queued.length;
    expect((await scripts.update(s.id, writer, { previewText: 'S#2. 다른 부분' })).previewText).toBe('S#2. 다른 부분');
    expect(queued.length).toBe(n);
    expect((await scripts.update(s.id, writer, { previewText: '' })).previewAvailable).toBe(false);
  });

  it('정지된 작가의 대본은 목록·상세에서 빠진다', async () => {
    const s = await scripts.create(writer, {
      title: `정지 테스트 ${suffix}`, logline: 'l', synopsis: 's', genre: '드라마', fullText: 'x', rightsDeclared: true,
    });
    await scripts.publish(s.id, writer, {});
    expect((await scripts.list({ q: `정지 테스트 ${suffix}` }, null)).items).toHaveLength(1);
    await prisma.user.update({ where: { id: writer.id }, data: { status: 'SUSPENDED' } });
    expect((await scripts.list({ q: `정지 테스트 ${suffix}` }, null)).items).toHaveLength(0);
    await expect(scripts.get(s.id, producer)).rejects.toThrow(NotFoundException);
    expect((await scripts.get(s.id, { id: 'admin', roles: ['ADMIN'] })).title).toBe(`정지 테스트 ${suffix}`);
    await prisma.user.update({ where: { id: writer.id }, data: { status: 'ACTIVE' } });
  });
});
