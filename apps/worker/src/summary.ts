import { z } from 'zod';

/**
 * Script.aiSummary에 저장되는 JSON 형태. 웹(A)이 이 형태를 읽는다.
 * 바꿀 때는 docs/handoff/b-done.md도 함께 고친다.
 */
export const SummaryContentSchema = z.object({
  /** 3~5문장 한국어 줄거리 요약 (결말 스포일러 없이) */
  summary: z.string(),
  /** 장르·소재·분위기 태그 3~8개, 각 2~12자 */
  tags: z.array(z.string()),
  /** 예상 관람 등급 */
  contentRating: z.enum(['ALL', '12', '15', '19']),
});
export type SummaryContent = z.infer<typeof SummaryContentSchema>;

export interface AiSummary extends SummaryContent {
  /** 요약을 만든 모델 (mock이면 "mock") */
  model: string;
  /** ISO 8601 UTC */
  generatedAt: string;
}

export interface ScriptForSummary {
  id: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string;
  fullText: string;
}

export interface Summarizer {
  readonly model: string;
  summarize(script: ScriptForSummary): Promise<SummaryContent>;
}

/** 모델 출력이 형식을 조금 벗어나도 저장 가능한 형태로 정리한다. */
export function normalizeSummary(s: SummaryContent): SummaryContent {
  const tags = [...new Set(s.tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean))]
    .map((t) => t.slice(0, 12))
    .slice(0, 8);
  return { summary: s.summary.trim(), tags, contentRating: s.contentRating };
}
