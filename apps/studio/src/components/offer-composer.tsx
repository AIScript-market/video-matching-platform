"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap, type Offer } from "@/lib/api";

/** 조건 제안 카드. 작가·제작자 분배는 슬라이더 하나로 움직여 합계가 항상 100이다 */
export function OfferComposer({
  negotiationId,
  base,
  isCounter,
  onSent,
}: {
  negotiationId: string;
  base: Offer | null;
  isCounter: boolean;
  onSent: () => void;
}) {
  const [writerSharePct, setWriterShare] = useState(base?.writerSharePct ?? 50);
  const [upfrontFeeKrw, setFee] = useState(base?.upfrontFeeKrw ?? 0);
  const [termMonths, setTerm] = useState(base?.termMonths ?? 24);
  const [exclusive, setExclusive] = useState(base?.exclusive ?? true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/negotiations/{id}/offers", {
          params: { path: { id: negotiationId } },
          body: {
            writerSharePct,
            producerSharePct: 100 - writerSharePct,
            upfrontFeeKrw,
            termMonths,
            exclusive,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          },
        }),
      );
      setNotes("");
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="조건 제안">
      <h2>{isCounter ? "역제안하기" : "조건 제안하기"}</h2>
      <div className="stack" style={{ gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>수익 분배</span>
        <div className="row">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={writerSharePct}
            onChange={(e) => setWriterShare(Number(e.target.value))}
            aria-label="작가 분배 슬라이더"
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={writerSharePct}
            onChange={(e) => setWriterShare(Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))))}
            aria-label="작가 분배 비율"
            style={{ width: 80 }}
          />
        </div>
        <span className="spread small">
          <span>
            작가 <strong data-testid="writer-share">{writerSharePct}%</strong>
          </span>
          <span>
            제작자 <strong data-testid="producer-share">{100 - writerSharePct}%</strong>
          </span>
        </span>
      </div>
      <label>
        선급금 (원)
        <input type="number" min={0} step={100000} value={upfrontFeeKrw} onChange={(e) => setFee(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
      </label>
      <label>
        계약 기간 (개월)
        <input type="number" min={1} max={120} value={termMonths} onChange={(e) => setTerm(Math.round(Number(e.target.value) || 1))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        <span>독점 계약 (수락되면 이 대본의 다른 협상은 종료)</span>
      </label>
      <label>
        비고
        <textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
      </label>
      <ErrorText error={error} />
      <button type="submit" disabled={busy}>
        {isCounter ? "역제안 보내기" : "제안 보내기"}
      </button>
    </form>
  );
}
