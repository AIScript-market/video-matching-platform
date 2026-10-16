"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, type ScriptDetail } from "@/lib/api";

const rating = (r: string) => (r === "ALL" ? "전체관람가" : `${r}세`);

/**
 * AI 요약 + 최근 수정 시각. 작성자에게는 새로고침 버튼을 보여준다.
 * 요약은 작가가 공개한 로그라인·시놉시스로만 만든다 (전문은 쓰지 않는다). 소개 글이 없으면 만들지 않는다.
 * 요약을 만드는 중(aiSummaryPending)이면 부모 화면이 3초마다 다시 불러온다.
 */
export function AiSummaryCard({ script, onUpdated }: { script: ScriptDetail; onUpdated?: (s: ScriptDetail) => void }) {
  const { aiSummary, aiSummaryPending, viewer } = script;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(fn: () => Promise<ScriptDetail>) {
    setBusy(true);
    setError(null);
    try {
      onUpdated?.(await fn());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const path = { params: { path: { id: script.id } } };
  const refresh = () => call(() => unwrap(api.POST("/scripts/{id}/summary/refresh", path)));

  // 다른 사람에게는 요약이 있을 때만 카드를 그린다
  if (!viewer.isAuthor && !aiSummary) return null;

  return (
    <section className="card stack" aria-label="AI 요약">
      <div className="spread">
        <h2 style={{ margin: 0 }}>
          AI 요약 <span className="small muted">시놉시스 기준</span>
        </h2>
        {viewer.isAuthor && (
          <button type="button" className="ghost" onClick={() => void refresh()} disabled={busy || aiSummaryPending}>
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
        !aiSummaryPending && <p className="muted small">아직 요약이 없습니다. 로그라인이나 시놉시스를 쓰고 저장하면 만듭니다.</p>
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
