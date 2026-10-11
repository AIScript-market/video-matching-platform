import type { Coverage, ScriptForSummary, SummaryContent, Summarizer } from './summary.js';

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

    return { summary, tags, contentRating, coverage: mockCoverage(text) };
  }
}

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
const SCENE = /^\s*(S#\s*\d+\.?|INT\.|EXT\.|씬\s*\d+)\s*(.*)$/;
const CONFLICT_WORDS = ['비밀', '실종', '의심', '싸움', '거짓', '복수', '쫓', '배신', '위협', '사라'];
const HOOK_WORDS = ['소리', '비명', '총', '기적', '폭발', '피', '시체', '사라', '갑자기'];
const HARD_WORDS = ['폭발', '추격', '수중', '헬기', '군중', '전투', 'CG'];

/**
 * 키 없이 개발할 때 쓰는 결정적 커버리지. 장면 머리·인물 이름·낱말로 대략 계산하는 흉내일 뿐이고,
 * 실제 판단은 Claude 요약기가 한다.
 */
export function mockCoverage(text: string): Coverage {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const scenes = lines.map((l) => SCENE.exec(l)).filter((m): m is RegExpExecArray => Boolean(m));
  const locations = new Set(scenes.map((m) => m[2]!.replace(/\(.*\)/g, '').split('-')[0]!.trim()).filter(Boolean));
  const speakers = new Set(
    lines
      .map((l, i) => (/^[가-힣A-Za-z]{1,6}$/.test(l) && lines[i + 1] ? l : (/^([가-힣]{1,6})\s*:/.exec(l)?.[1] ?? '')))
      .filter((n) => n && !SCENE.test(n)),
  );
  const count = (words: string[]) => words.filter((w) => text.includes(w)).length;
  const firstScene = text.slice(0, 400);
  const dialogueShare = lines.filter((l) => l && !SCENE.test(l)).length / Math.max(1, lines.filter(Boolean).length);

  const scores = {
    hook: clamp(2 + HOOK_WORDS.filter((w) => firstScene.includes(w)).length),
    conflict: clamp(2 + count(CONFLICT_WORDS)),
    characters: clamp(speakers.size === 0 ? 2 : speakers.size <= 5 ? 4 : 3),
    pacing: clamp(1 + (scenes.length / Math.max(1, text.length)) * 2000),
    dialogue: clamp(2 + dialogueShare * 3),
  };
  const productionDifficulty = clamp((locations.size <= 2 ? 1 : locations.size <= 5 ? 2 : locations.size <= 10 ? 3 : 4) + Math.min(1, count(HARD_WORDS)));
  const strengths = [
    scores.hook >= 4 && '첫 장면에서 바로 사건이 시작된다',
    scores.conflict >= 4 && '갈등의 축이 분명하다',
    productionDifficulty <= 2 && '장소가 적어 저예산 촬영에 맞다',
  ].filter((x): x is string => Boolean(x));
  const risks = [
    scores.hook <= 2 && '첫 장면이 느려 초반 이탈 위험이 있다',
    scores.conflict <= 2 && '주인공이 무엇을 원하는지 아직 흐릿하다',
    productionDifficulty >= 4 && '장소·특수 장면이 많아 제작비가 크다',
  ].filter((x): x is string => Boolean(x));
  return {
    scores,
    productionDifficulty,
    estimatedCast: speakers.size,
    estimatedLocations: locations.size,
    strengths,
    risks,
    comparableTitles: [],
  };
}

