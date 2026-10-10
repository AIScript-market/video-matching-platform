import type { ScriptForSummary, SummaryContent, Summarizer } from './summary.js';

const STOPWORDS = new Set([
  '그리고', '하지만', '그런데', '그래서', '있다', '없다', '한다', '했다', '이다', '그는', '그녀는',
  '우리', '너는', '나는', '이제', '정말', '그냥', '지금', '여기', '거기', '어디', '무슨', '이건', '그건',
  'INT', 'EXT', '장면', '씬', '컷',
]);

const RATING_19 = ['마약', '성관계', '정사', '노출', '섹스'];
const RATING_15 = ['살인', '시체', '총격', '칼부림', '피투성이', '폭행', '자살'];
const RATING_12 = ['싸움', '피', '죽음', '총', '욕설'];

/**
 * API 키 없이 개발·테스트할 때 쓰는 결정적(deterministic) 요약기.
 * 시놉시스 앞부분을 요약으로, 자주 나오는 단어를 태그로 쓴다.
 */
export class MockSummarizer implements Summarizer {
  readonly model = 'mock';

  async summarize(script: ScriptForSummary): Promise<SummaryContent> {
    const source = script.synopsis?.trim() || script.logline?.trim() || script.fullText;
    const sentences = source
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?。])\s+/)
      .filter(Boolean)
      .slice(0, 3);
    const summary = sentences.join(' ').slice(0, 400) || script.logline;

    const counts = new Map<string, number>();
    for (const word of script.fullText.match(/[가-힣]{2,6}/g) ?? []) {
      if (STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const frequent = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([w]) => w);
    const tags = [script.genre, ...frequent].filter(Boolean);

    const text = script.fullText;
    const has = (words: string[]) => words.some((w) => text.includes(w));
    const contentRating = has(RATING_19) ? '19' : has(RATING_15) ? '15' : has(RATING_12) ? '12' : 'ALL';

    return { summary, tags, contentRating };
  }
}
