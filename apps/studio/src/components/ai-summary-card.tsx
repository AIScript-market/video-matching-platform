"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, type ScriptDetail } from "@/lib/api";

const rating = (r: string) => (r === "ALL" ? "전체관람가" : `${r}세`);

/**
 * AI 요약 + 최근 수정 시각. 작성자에게는 새로고침과 공개 여부 버튼을 보여준다.
 * 요약은 전문으로 만들어서, 작가가 공개하기 전에는 작가와 열람 승인된 제작자만 본다 (API가 가린다).
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
  const setPublic = (value: boolean) => call(() => unwrap(api.POST("/scripts/{id}/summary/visibility", { ...path, body: { public: value } })));

  // 다른 사람: 볼 수 있는 요약만. 가려져 있으면 이유만 알린다 (요약이 없으면 카드를 그리지 않는다)
  if (!viewer.isAuthor) {
    if (script.aiSummaryHidden)
      return (
        <section className="card stack" aria-label="AI 요약">
          <h2 style={{ margin: 0 }}>AI 요약</h2>
          <p className="muted small">AI 요약은 비밀유지 서약에 서명하고 작가가 열람을 승인하면 볼 수 있습니다.</p>
        </section>
      );
    if (!aiSummary) return null;
  }
  if (viewer.isAuthor && !script.aiSummaryConsent)
    return (
      <section className="card stack" aria-label="AI 요약">
        <h2 style={{ margin: 0 }}>AI 요약</h2>
        <p className="muted small">AI 요약을 쓰지 않는 대본입니다. 대본 편집의 &quot;확인과 동의&quot;에서 켤 수 있습니다.</p>
      </section>
    );

  return (
    <section className="card stack" aria-label="AI 요약">
      <div className="spread">
        <h2 style={{ margin: 0 }}>AI 요약</h2>
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
        !aiSummaryPending && <p className="muted small">아직 요약이 없습니다.</p>
      )}
      {viewer.isAuthor && aiSummary && (
        <div className="notice small stack" role="status" aria-label="요약 공개 여부">
          {script.aiSummaryPublic ? (
            <>
              <span>
                <strong>공개 중</strong> · 대본 목록과 소개에서 누구나 이 요약을 봅니다.
              </span>
              <div className="row">
                <button type="button" className="secondary" onClick={() => void setPublic(false)} disabled={busy}>
                  비공개로 돌리기
                </button>
              </div>
            </>
          ) : (
            <>
              <span>
                <strong>비공개</strong> · 작가님과 비밀유지 서약 후 열람을 승인한 제작자만 봅니다. 결말이나 반전이 드러나지 않는지 읽어 본 뒤 공개하세요.
              </span>
              <div className="row">
                <button type="button" className="secondary" onClick={() => void setPublic(true)} disabled={busy || aiSummaryPending}>
                  읽어 봤어요, 공개 소개에 보이기
                </button>
              </div>
            </>
          )}
        </div>
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
