"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { pct, ReadinessMeter, SimilarWorks } from "@/components/hit-insight";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, unwrap, type Schemas } from "@/lib/api";

type Recommendations = Schemas["RecommendationsDto"];

export default function RecommendationsPage() {
  return (
    <RequireAuth>
      <Recommendations />
    </RequireAuth>
  );
}

function Recommendations() {
  const [data, setData] = useState<Recommendations | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/recommendations/scripts", { params: { query: { limit: 20 } } }))
        .then(setData)
        .catch((err: Error) => setError(err.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <h1>추천 대본</h1>
      <p className="muted small">
        공개된 대본을 우리 흥행 판단 모델 순서로 보여 줍니다. 대본 벡터와 플랫폼 작품 성과(채널 크기 보정한 조회수·좋아요·긍정 댓글)로 학습한
        통계 모델입니다. 내 대본은 빠집니다.
      </p>
      <ErrorText error={error} />
      {data && (
        <>
          {data.mode === "MODEL" ? (
            <p className="notice small" style={{ margin: 0 }}>
              모델 {data.modelVersion} · 학습 대본 {data.trainingPairs}편. 확률은 &ldquo;채널 크기를 보정한 성과가 상위 20%일 확률&rdquo;입니다.
            </p>
          ) : (
            <div className="card stack">
              <ReadinessMeter trainingPairs={data.trainingPairs} requiredPairs={data.requiredPairs} />
              <p className="small muted" style={{ margin: 0 }}>
                {data.mode === "NEIGHBORS"
                  ? "모델 학습 전이라 벡터가 비슷한 작품들의 성과로 정렬했습니다 (참고 신호)."
                  : "아직 성과 데이터가 없어 최신순으로 보여 줍니다."}
              </p>
            </div>
          )}
          {data.items.length === 0 && <p className="muted">추천할 대본이 없습니다.</p>}
          <div className="grid">
            {data.items.map((s, i) => (
              <article key={s.id} className="card stack" style={{ gap: 8 }}>
                <div className="spread">
                  <span className="row">
                    <span className="badge plain">{i + 1}</span>
                    <span className="badge">{s.genre}</span>
                  </span>
                  {data.mode === "MODEL" && s.probability !== undefined ? (
                    <strong title={s.low !== undefined && s.high !== undefined ? `범위 ${pct(s.low)} ~ ${pct(s.high)}` : undefined}>{pct(s.probability)}</strong>
                  ) : data.mode === "NEIGHBORS" && s.score !== null ? (
                    <span className="small muted">신호 {s.score.toFixed(2)}</span>
                  ) : null}
                </div>
                <h3 style={{ margin: 0 }}>
                  <Link href={`/scripts/${s.id}`}>{s.title}</Link>
                </h3>
                <p className="small" style={{ margin: 0 }}>
                  {s.logline}
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  {s.authorName}
                </p>
                {s.neighbors.length > 0 && <SimilarWorks items={s.neighbors} />}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
