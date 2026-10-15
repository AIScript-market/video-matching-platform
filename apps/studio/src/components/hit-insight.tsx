"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, unwrap, type Schemas } from "@/lib/api";

export type HitInsight = Schemas["HitInsightDto"];
export type SimilarWork = Schemas["SimilarWorkDto"];

export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** 범위가 이만큼 넓으면 학습 데이터와 많이 다른 대본이라 숫자를 믿기 어렵다 */
export const isUncertain = (low?: number, high?: number) => low !== undefined && high !== undefined && high - low >= 0.4;

/** 학습 데이터가 모델 학습 기준까지 얼마나 쌓였는지 */
export function ReadinessMeter({ trainingPairs, requiredPairs }: { trainingPairs: number; requiredPairs: number }) {
  const ratio = Math.min(1, trainingPairs / Math.max(requiredPairs, 1));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="small">
        {trainingPairs < requiredPairs ? (
          <>
            모델 학습 전 · 학습 데이터 <strong>{trainingPairs}</strong>/{requiredPairs}편
          </>
        ) : (
          <>
            학습 데이터 <strong>{trainingPairs}</strong>편 (학습 기준 {requiredPairs}편 충족)
          </>
        )}
      </div>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={requiredPairs} aria-valuenow={trainingPairs}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** 확률과 부트스트랩 범위 (10%~90%) */
export function ProbabilityBar({ probability, low, high }: { probability: number; low?: number; high?: number }) {
  return (
    <div className="prob" aria-label={`상위 20% 성과 확률 ${pct(probability)}`}>
      {low !== undefined && high !== undefined && <span className="prob-range" style={{ left: `${low * 100}%`, width: `${Math.max(high - low, 0.005) * 100}%` }} />}
      <span className="prob-point" style={{ left: `${probability * 100}%` }} />
    </div>
  );
}

/** 성과 백분위(0~1) → "상위 12%" / "하위 30%" */
const rankLabel = (percentile: number) => (percentile >= 0.5 ? `성과 상위 ${pct(1 - percentile)}` : `성과 하위 ${pct(percentile)}`);

export function SimilarWorks({ items }: { items: SimilarWork[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="plain-list">
      {items.map((n) => (
        <li key={n.scriptId} className="spread small">
          <span>
            {n.title === "비공개 대본" ? <span className="muted">비공개 대본</span> : <Link href={`/scripts/${n.scriptId}`}>{n.title}</Link>}
            {n.workTitle && <span className="muted"> · {n.workTitle}</span>}
          </span>
          <span className="row" style={{ flexWrap: "nowrap" }}>
            <span className="muted">유사도 {pct(Math.max(n.similarity, 0))}</span>
            {n.hit ? <span className="badge ok">성공작</span> : <span className="badge plain">{rankLabel(n.percentile)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 대본 상세의 흥행 판단 카드 (영상 제작자·관리자). 작가 본인에게는 부모 화면이 그리지 않는다.
 * LLM이 아니라 대본 벡터와 우리 플랫폼 작품 성과로 학습한 통계 모델의 결과다.
 */
export function HitInsightCard({ scriptId }: { scriptId: string }) {
  const [insight, setInsight] = useState<HitInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/scripts/{id}/hit-insight", { params: { path: { id: scriptId } } }))
        .then((data) => {
          setInsight(data);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [scriptId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card stack" aria-label="흥행 판단">
      <h2 style={{ margin: 0 }}>흥행 판단</h2>
      {error ? (
        <p className="muted small">{error}</p>
      ) : !insight ? (
        <p className="muted small">불러오는 중…</p>
      ) : insight.mode === "MODEL" && insight.probability !== undefined ? (
        <div className="stack" style={{ gap: 8 }}>
          <div>
            <div className="small muted">채널 크기를 보정한 성과가 상위 20%일 확률</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{pct(insight.probability)}</div>
            {insight.low !== undefined && insight.high !== undefined && (
              <div className="small muted">
                범위 {pct(insight.low)} ~ {pct(insight.high)}
              </div>
            )}
            {isUncertain(insight.low, insight.high) && (
              <p className="notice small" style={{ margin: "6px 0 0" }}>
                범위가 넓습니다. 학습한 작품들과 많이 다른 대본이라 이 숫자는 참고만 하세요.
              </p>
            )}
          </div>
          <ProbabilityBar probability={insight.probability} low={insight.low} high={insight.high} />
          {insight.neighbors.length > 0 && <h3 style={{ margin: "8px 0 0" }}>가장 비슷한 작품</h3>}
          <SimilarWorks items={insight.neighbors} />
          <p className="small muted" style={{ margin: 0 }}>
            모델 {insight.modelVersion} · 학습 대본 {insight.trainingPairs}편
          </p>
        </div>
      ) : insight.mode === "NOT_EMBEDDED" ? (
        <p className="muted small">본문이 없어 판단할 수 없습니다.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <ReadinessMeter trainingPairs={insight.trainingPairs} requiredPairs={insight.requiredPairs} />
          {insight.mode === "NEIGHBORS" ? (
            <>
              <h3 style={{ margin: "8px 0 0" }}>벡터가 비슷한 작품</h3>
              <SimilarWorks items={insight.neighbors} />
              <p className="small muted" style={{ margin: 0 }}>
                모델을 학습할 만큼 데이터가 쌓이기 전에는 대본 벡터가 가까운 작품과 그 성과를 보여 줍니다.
              </p>
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              아직 성과가 쌓인 작품이 적어 비교할 작품이 없습니다.
            </p>
          )}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        대본을 장면 벡터로 바꾸고, 우리 플랫폼 작품의 조회수·좋아요·긍정 댓글(채널 크기 보정)과 연결해 학습한 통계 모델입니다. 작가에게는 보이지 않습니다.
      </p>
    </section>
  );
}
