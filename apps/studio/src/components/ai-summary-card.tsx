"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, type ScriptDetail } from "@/lib/api";

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
