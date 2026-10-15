"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap } from "@/lib/api";
import {
  CONTENT_TAGS,
  FEE_TYPE_LABEL,
  TAG_LABEL,
  USAGE_LABEL,
  type CastingOffer,
  type ContentTag,
  type FeeType,
  type UsageScope,
} from "@/lib/casting";

/** 장면 유형 태그 목록 (읽기 전용) */
export function TagList({ tags, empty = "없음" }: { tags: ContentTag[]; empty?: string }) {
  if (!tags.length) return <span className="muted small">{empty}</span>;
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          {TAG_LABEL[t]}
        </span>
      ))}
    </span>
  );
}

/** 장면 유형 고르기. minorOnly면 미성년자 금지 유형은 고를 수 없다 */
export function TagPicker({
  value,
  onChange,
  minorOnly = false,
  legend,
}: {
  value: ContentTag[];
  onChange: (tags: ContentTag[]) => void;
  minorOnly?: boolean;
  legend: string;
}) {
  return (
    <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>{legend}</legend>
      {CONTENT_TAGS.map(({ tag, label, hint, minor }) => {
        const blocked = minorOnly && minor === "no";
        return (
          <label key={tag} className="check">
            <input
              type="checkbox"
              checked={value.includes(tag)}
              disabled={blocked}
              onChange={(e) => onChange(e.target.checked ? [...value, tag] : value.filter((t) => t !== tag))}
            />
            <span>
              {label} <span className="muted small">— {hint}{blocked ? " (미성년자 불가)" : ""}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** 출연료 제안·역제안 */
export function CastingOfferComposer({
  negotiationId,
  base,
  isCounter,
  onSent,
}: {
  negotiationId: string;
  base: CastingOffer | null;
  isCounter: boolean;
  onSent: () => void;
}) {
  const [feeType, setFeeType] = useState<FeeType>(base?.feeType ?? "FLAT");
  const [flatFeeKrw, setFlat] = useState(base?.flatFeeKrw || 300_000);
  const [perEpisodeFeeKrw, setPerEpisode] = useState(base?.perEpisodeFeeKrw || 50_000);
  const [episodes, setEpisodes] = useState(base?.episodes ?? 6);
  const [revenueSharePct, setPct] = useState(base?.revenueSharePct || 5);
  const [usage, setUsage] = useState<UsageScope>(base?.usage ?? "DIGITAL");
  const [termMonths, setTerm] = useState(base?.termMonths ?? 12);
  const [productionDays, setDays] = useState(base?.productionDays ?? 30);
  const [exclusive, setExclusive] = useState(base?.exclusive ?? false);
  const [requiresTalentApproval, setApproval] = useState(base?.requiresTalentApproval ?? true);
  const [earlyTerminationPct, setEarly] = useState(base?.earlyTerminationPct ?? 50);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showFlat = feeType === "FLAT" || feeType === "HYBRID";
  const showPerEpisode = feeType === "PER_EPISODE";
  const showPct = feeType === "REVENUE_SHARE" || feeType === "HYBRID";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/casting/negotiations/{id}/offers", {
          params: { path: { id: negotiationId } },
          body: {
            feeType,
            ...(showFlat ? { flatFeeKrw } : {}),
            ...(showPerEpisode ? { perEpisodeFeeKrw, episodes } : {}),
            ...(showPct ? { revenueSharePct } : {}),
            usage,
            termMonths,
            productionDays,
            exclusive,
            requiresTalentApproval,
            earlyTerminationPct,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        }),
      );
      setNote("");
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Math.max(0, Math.round(Number(e.target.value) || 0)));

  return (
    <form className="card stack" onSubmit={submit} aria-label="출연료 제안">
      <h2>{isCounter ? "역제안하기" : "출연료 제안하기"}</h2>
      <label>
        출연료 방식
        <select value={feeType} onChange={(e) => setFeeType(e.target.value as FeeType)}>
          {(Object.keys(FEE_TYPE_LABEL) as FeeType[]).map((f) => (
            <option key={f} value={f}>
              {FEE_TYPE_LABEL[f]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {showFlat && (
          <label>
            고정 출연료 (원)
            <input type="number" min={0} step={10000} value={flatFeeKrw} onChange={num(setFlat)} />
          </label>
        )}
        {showPerEpisode && (
          <>
            <label>
              회당 출연료 (원)
              <input type="number" min={0} step={10000} value={perEpisodeFeeKrw} onChange={num(setPerEpisode)} />
            </label>
            <label>
              회차 수
              <input type="number" min={1} max={500} value={episodes} onChange={num(setEpisodes)} />
            </label>
          </>
        )}
        {showPct && (
          <label>
            순수익 배분 (%)
            <input type="number" min={1} max={100} value={revenueSharePct} onChange={num(setPct)} />
          </label>
        )}
        <label>
          사용 범위
          <select value={usage} onChange={(e) => setUsage(e.target.value as UsageScope)}>
            {(Object.keys(USAGE_LABEL) as UsageScope[]).map((u) => (
              <option key={u} value={u}>
                {USAGE_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          계약 기간 (개월)
          <input type="number" min={1} max={120} value={termMonths} onChange={num(setTerm)} />
        </label>
        <label>
          제작 기한 (일, 최대 90)
          <input type="number" min={1} max={90} value={productionDays} onChange={num(setDays)} />
        </label>
        <label>
          조기 종료 보상 (%)
          <input type="number" min={0} max={200} value={earlyTerminationPct} onChange={num(setEarly)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={requiresTalentApproval} onChange={(e) => setApproval(e.target.checked)} />
        <span>출연분 확인권 (출연자가 확인해야 공개)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        <span>독점 (계약 기간 동안 다른 작품 출연 제한)</span>
      </label>
      <label>
        메모 (선택)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} style={{ minHeight: 64 }} />
      </label>
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? "보내는 중…" : isCounter ? "역제안 보내기" : "제안 보내기"}
        </button>
      </div>
    </form>
  );
}

/** 작품 상태 */
export function WorkStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    DRAFT: ["공개 전", "warn"],
    PUBLISHED: ["공개", "ok"],
    UNLISTED: ["비공개 (신고 검토 중)", "bad"],
    REMOVED: ["내려감", "plain"],
  };
  const [label, tone] = map[status] ?? [status, "plain"];
  return <span className={`badge ${tone}`}>{label}</span>;
}
