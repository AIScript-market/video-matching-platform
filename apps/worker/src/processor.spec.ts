import { describe, expect, it } from 'vitest';
import { MockSummarizer } from './mock-summarizer.js';
import { processSummarize } from './processor.js';
import type { AiSummary, ScriptForSummary } from './summary.js';

function fakeRepo(script: ScriptForSummary | null) {
  const saved: AiSummary[] = [];
  return {
    saved,
    repo: {
      find: async () => script,
      saveSummary: async (_id: string, s: AiSummary) => {
        saved.push(s);
      },
    } as never,
  };
}

const script: ScriptForSummary = {
  id: 's1',
  title: '부산행 마지막 열차',
  logline: '폐역을 지키는 역무원이 마지막 열차의 비밀을 쫓는다.',
  synopsis: '1998년 부산. 폐역을 지키는 역무원 정수는 매일 밤 오지 않는 열차를 기다린다. 어느 날 정말로 열차가 도착한다.',
  genre: '미스터리',
};

describe('processSummarize', () => {
  it('요약을 만들어 모델·생성 시각과 함께 저장한다', async () => {
    const { repo, saved } = fakeRepo(script);
    const result = await processSummarize(
      { scriptId: 's1' },
      { scripts: repo, summarizer: new MockSummarizer(), now: () => new Date('2026-10-11T00:00:00Z') },
    );
    expect(result).toEqual({ status: 'done', model: 'mock' });
    expect(saved).toHaveLength(1);
    expect(saved[0].summary).toContain('1998년 부산');
    expect(saved[0].tags[0]).toBe('미스터리');
    expect(saved[0].contentRating).toBe('ALL');
    expect(saved[0].generatedAt).toBe('2026-10-11T00:00:00.000Z');
  });

  it('대본이 없거나 로그라인·시놉시스가 비면 건너뛴다', async () => {
    expect((await processSummarize({ scriptId: 'x' }, { scripts: fakeRepo(null).repo, summarizer: new MockSummarizer() })).status).toBe('skipped');
    expect(
      (await processSummarize({ scriptId: 's1' }, { scripts: fakeRepo({ ...script, logline: '', synopsis: ' ' }).repo, summarizer: new MockSummarizer() })).status,
    ).toBe('skipped');
  });

  it('태그는 중복 제거·8개 이하로 정리된다', async () => {
    const { repo, saved } = fakeRepo(script);
    const summarizer = {
      model: 'test',
      summarize: async () => ({ summary: ' 요약 ', tags: ['#a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], contentRating: 'ALL' as const }),
    };
    await processSummarize({ scriptId: 's1' }, { scripts: repo, summarizer });
    expect(saved[0].summary).toBe('요약');
    expect(saved[0].tags).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('ML 서비스가 있으면 벡터화를 요청하고, 실패해도 요약은 저장한다', async () => {
    const calls: string[] = [];
    const ok = fakeRepo(script);
    const done = await processSummarize(
      { scriptId: 's1' },
      { scripts: ok.repo, summarizer: new MockSummarizer(), embed: async (id) => void calls.push(id) },
    );
    expect(calls).toEqual(['s1']);
    expect(done).toMatchObject({ status: 'done', embedding: 'ok' });

    const failing = fakeRepo(script);
    const failed = await processSummarize(
      { scriptId: 's1' },
      { scripts: failing.repo, summarizer: new MockSummarizer(), embed: async () => Promise.reject(new Error('down')) },
    );
    expect(failed).toMatchObject({ status: 'done', embedding: 'failed' });
    expect(failing.saved).toHaveLength(1);
  });
});
