import { z } from 'zod';

/** 1~5점. 높을수록 좋다 (productionDifficulty만 높을수록 어렵다) */
const Score = z.number().int().min(1).max(5);

/**
 * PD가 대본을 검토할 때 보는 항목 (커버리지 리포트). 흥행 예측이 아니라 판단을 돕는 참고 자료다.
 * 점수는 작가 본인에게는 보이지 않는다 (점수에 맞춰 쓰는 것을 막기 위해). 기준: docs/hit-model.md
 */
export const CoverageSchema = z.object({
  scores: z.object({
    /** 첫 장면이 시청자를 붙잡는 힘 (유튜브는 첫 30초 이탈이 크다) */
    hook: Score,
    /** 주인공이 무엇을 원하고 무엇이 막는지 분명한가 */
    conflict: Score,
    /** 인물의 매력과 입체성 */
    characters: Score,
    /** 장면 전환과 반전의 밀도 */
    pacing: Score,
    /** 대사의 자연스러움과 개성 */
    dialogue: Score,
  }),
  /** 제작 난이도 1~5 (장소·인물 수, 특수효과, 야외·야간 촬영) */
  productionDifficulty: Score,
  /** 대사가 있는 주요 인물 수 추정 */
  estimatedCast: z.number().int().min(0).max(200),
  /** 서로 다른 촬영 장소 수 추정 */
  estimatedLocations: z.number().int().min(0).max(500),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  /** 구조·톤이 비슷한 기존 작품 (참고용) */
  comparableTitles: z.array(z.string()),
});
export type Coverage = z.infer<typeof CoverageSchema>;

/**
 * Script.aiSummary에 저장되는 JSON 형태. 웹이 이 형태를 읽는다.
 * coverage는 2026-10에 추가했다: 그 전에 만든 요약에는 없을 수 있다.
 * 바꿀 때는 docs/handoff/b-done.md도 함께 고친다.
 */
export const SummaryContentSchema = z.object({
  /** 3~5문장 한국어 줄거리 요약 (결말 스포일러 없이) */
  summary: z.string(),
  /** 장르·소재·분위기 태그 3~8개, 각 2~12자 */
  tags: z.array(z.string()),
  /** 예상 관람 등급 */
  contentRating: z.enum(['ALL', '12', '15', '19']),
  coverage: CoverageSchema,
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

const shortList = (items: string[], max: number, len: number) =>
  [...new Set(items.map((t) => t.trim()).filter(Boolean))].map((t) => t.slice(0, len)).slice(0, max);

/** 모델 출력이 형식을 조금 벗어나도 저장 가능한 형태로 정리한다. */
export function normalizeSummary(s: SummaryContent): SummaryContent {
  const c = s.coverage;
  return {
    summary: s.summary.trim(),
    tags: shortList(
      s.tags.map((t) => t.replace(/^#/, '')),
      8,
      12,
    ),
    contentRating: s.contentRating,
    coverage: {
      scores: c.scores,
      productionDifficulty: c.productionDifficulty,
      estimatedCast: c.estimatedCast,
      estimatedLocations: c.estimatedLocations,
      strengths: shortList(c.strengths, 3, 120),
      risks: shortList(c.risks, 3, 120),
      comparableTitles: shortList(c.comparableTitles, 3, 40),
    },
  };
}
