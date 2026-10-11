"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, type ScriptDetail } from "@/lib/api";

type Coverage = NonNullable<NonNullable<ScriptDetail["aiSummary"]>["coverage"]>;

const rating = (r: string) => (r === "ALL" ? "전체관람가" : `${r}세`);

/**
 * AI 요약 + 최근 수정 시각. 작성자에게는 새로고침 버튼을 보여준다.
 * 요약을 만드는 중(aiSummaryPending)이면 부모 화면이 3초마다 다시 불러온다.
 */
export function AiSummaryCard({ script, onUpdated }: { script: ScriptDetail; onUpdated?: (s: ScriptDetail) => void }) {
  const { aiSummary, aiSummaryPending, viewer } = script;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      onUpdated?.(await unwrap(api.POST("/scripts/{id}/summary/refresh", { params: { path: { id: script.id } } })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="AI 요약">
      <div className="spread">
        <h2 style={{ margin: 0 }}>AI 요약</h2>
        {viewer.isAuthor && (
          <button type="button" className="ghost" onClick={refresh} disabled={busy || aiSummaryPending}>
            {aiSummaryPending ? "요약 만드는 중…" : "AI 요약 새로고침"}
          </button>
        )}
      </div>
      {aiSummaryPending && (
        <p className="notice small" role="status">
          {aiSummary ? "바뀐 내용으로 요약을 다시 만드는 중입니다. 아래는 이전 요약입니다." : "요약을 만드는 중입니다…"}
        </p>
      )}
      {aiSummary ? (
        <div className="stack" style={{ opacity: aiSummaryPending ? 0.6 : 1 }}>
          <p style={{ margin: 0 }}>{aiSummary.summary}</p>
          {aiSummary.coverage && <CoverageView coverage={aiSummary.coverage} isAuthor={viewer.isAuthor} />}
          <div className="tags">
            {aiSummary.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
            <span className="tag">예상 등급: {rating(aiSummary.contentRating)}</span>
          </div>
        </div>
      ) : (
        !aiSummaryPending && <p className="muted small">아직 요약이 없습니다.</p>
      )}
      <dl className="small muted" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", margin: 0 }}>
        <dt>대본 마지막 수정</dt>
        <dd style={{ margin: 0 }} data-testid="content-updated-at">
          {dateTime(script.contentUpdatedAt)}
        </dd>
        <dt>요약 생성</dt>
        <dd style={{ margin: 0 }} data-testid="summary-generated-at">
          {aiSummary ? dateTime(aiSummary.generatedAt) : "-"}
          {aiSummary && aiSummary.model !== "seed" && <span> · {aiSummary.model}</span>}
        </dd>
      </dl>
      <ErrorText error={error} />
    </section>
  );
}

const SCORE_LABEL: Record<keyof NonNullable<Coverage["scores"]>, string> = {
  hook: "첫 장면 훅",
  conflict: "갈등",
  characters: "인물",
  pacing: "전개",
  dialogue: "대사",
};

/**
 * PD 관점 검토 의견 (AI). 점수는 영상 제작자에게만 오고(작가 본인에게는 오지 않음), 흥행 예측이 아니라 참고용이다.
 */
function CoverageView({ coverage, isAuthor }: { coverage: Coverage; isAuthor: boolean }) {
  const { scores } = coverage;
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }} aria-label="AI 검토 의견">
      <div className="spread">
        <strong className="small">AI 검토 의견</strong>
        <span className="muted small">참고용 · 흥행 예측이 아닙니다</span>
      </div>
      {scores && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {(Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]).map((k) => (
            <div key={k} className="small">
              <span className="muted">{SCORE_LABEL[k]}</span>{" "}
              <span aria-label={`${scores[k]}점 / 5점`}>
                {"●".repeat(scores[k])}
                <span className="muted">{"○".repeat(5 - scores[k])}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="small" style={{ margin: 0 }}>
        제작 난이도 {coverage.productionDifficulty}/5 · 주요 인물 약 {coverage.estimatedCast}명 · 촬영 장소 약 {coverage.estimatedLocations}곳
      </p>
      {coverage.strengths.length > 0 && (
        <p className="small" style={{ margin: 0 }}>
          <strong>강점</strong> {coverage.strengths.join(" · ")}
        </p>
      )}
      {coverage.risks.length > 0 && (
        <p className="small" style={{ margin: 0 }}>
          <strong>고려할 점</strong> {coverage.risks.join(" · ")}
        </p>
      )}
      {coverage.comparableTitles.length > 0 && <p className="small muted" style={{ margin: 0 }}>비슷한 작품: {coverage.comparableTitles.join(", ")}</p>}
      {isAuthor && <p className="small muted" style={{ margin: 0 }}>점수는 영상 제작자에게만 보입니다. 작가에게는 의견만 보여 드립니다.</p>}
    </div>
  );
}
