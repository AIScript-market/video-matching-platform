"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CastingOfferComposer, TagList } from "@/components/casting-ui";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { feeSummary, USAGE_LABEL, type CastingNegotiation, type CastingOffer } from "@/lib/casting";

export default function CastingNegotiationPage() {
  return (
    <RequireAuth>
      <Detail />
    </RequireAuth>
  );
}

const OFFER_STATUS: Record<CastingOffer["status"], [string, string]> = {
  PROPOSED: ["제안됨", "warn"],
  COUNTERED: ["역제안됨", "plain"],
  WITHDRAWN: ["대체됨", "plain"],
  PENDING_GUARDIAN: ["보호자 승인 대기", "warn"],
  REJECTED_BY_GUARDIAN: ["보호자 거절", "bad"],
  ACCEPTED: ["수락 → 계약", "ok"],
};

function Detail() {
  const { id } = useParams<{ id: string }>();
  const [n, setN] = useState<CastingNegotiation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    unwrap(api.GET("/casting/negotiations/{id}", { params: { path: { id } } }))
      .then(setN)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (!n) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;

  const mySide = n.viewerSide === "STUDIO" ? "STUDIO" : "TALENT";
  const open = n.offers.find((o) => o.status === "PROPOSED" || o.status === "PENDING_GUARDIAN") ?? null;
  const latest = n.offers.at(-1) ?? null;
  const canAccept = open?.status === "PROPOSED" && open.side !== mySide;
  const guardianTurn = open?.status === "PENDING_GUARDIAN" && n.viewerSide === "GUARDIAN";

  async function act(run: () => Promise<unknown>) {
    setActionError(null);
    try {
      await run();
      load();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>
            {n.projectTitle} · {n.roleName}
          </h1>
          <p className="muted small">
            출연자 {n.talentStageName}
            {n.talentIsMinor ? " (미성년 — 계약은 보호자 승인 필요)" : ""} · 장면 유형 <TagList tags={n.roleContentTags} /> ·{" "}
            {n.initiatedBy === "TALENT" ? "출연자 지원" : "기획사 제안"}으로 시작
          </p>
        </div>
        <StatusBadge status={n.status} />
      </div>
      {n.message && <p className="notice small">“{n.message}”</p>}

      {n.contractId && (
        <p className="notice">
          계약이 성립했습니다. {n.viewerSide === "STUDIO" ? (
            <Link href={`/projects/${n.projectId}`}>작품 화면에서 작품을 만들 수 있습니다 →</Link>
          ) : n.viewerSide === "GUARDIAN" ? (
            <Link href="/guardian">보호자 화면으로 →</Link>
          ) : (
            <Link href="/talent">내 계약 보기 →</Link>
          )}
        </p>
      )}

      <div className="two-col">
        <section className="card stack">
          <h2>제안 이력</h2>
          {n.offers.length === 0 && <p className="muted small">아직 제안이 없습니다.</p>}
          <ol className="timeline">
            {n.offers.map((o) => (
              <li key={o.id} className={o.status === "ACCEPTED" ? "accepted" : o.status === "PROPOSED" ? "proposed" : undefined}>
                <div className="spread">
                  <strong>{o.side === "STUDIO" ? "기획사" : "출연자 쪽"} 제안</strong>
                  <span className={`badge ${OFFER_STATUS[o.status][1]}`}>{OFFER_STATUS[o.status][0]}</span>
                </div>
                <p className="small" style={{ margin: "4px 0" }}>
                  {feeSummary(o)} · {USAGE_LABEL[o.usage]} · {o.termMonths}개월 · 제작 기한 {o.productionDays}일 · {o.exclusive ? "독점" : "비독점"} ·{" "}
                  {o.requiresTalentApproval ? "출연분 확인권 있음" : "확인권 없음"} · 조기 종료 보상 {o.earlyTerminationPct}%
                </p>
                {o.note && <p className="small pre muted">{o.note}</p>}
                <span className="small muted">{dateTime(o.createdAt)}</span>
              </li>
            ))}
          </ol>
          <div className="row">
            {canAccept && (
              <button onClick={() => void act(() => unwrap(api.POST("/casting/offers/{id}/accept", { params: { path: { id: open!.id } } })))}>
                이 조건 수락
              </button>
            )}
            {guardianTurn && (
              <>
                <button
                  onClick={() =>
                    void act(() => unwrap(api.POST("/casting/offers/{id}/guardian-decision", { params: { path: { id: open!.id } }, body: { approve: true } })))
                  }
                >
                  보호자로서 승인
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void act(() => unwrap(api.POST("/casting/offers/{id}/guardian-decision", { params: { path: { id: open!.id } }, body: { approve: false } })))
                  }
                >
                  거절
                </button>
              </>
            )}
          </div>
          {open?.status === "PENDING_GUARDIAN" && n.viewerSide !== "GUARDIAN" && <p className="small muted">보호자의 승인을 기다리고 있습니다.</p>}
          <ErrorText error={actionError} />
        </section>

        {n.status === "OPEN" && (
          <CastingOfferComposer negotiationId={n.id} base={latest} isCounter={Boolean(open && open.side !== mySide)} onSent={load} />
        )}
      </div>
    </div>
  );
}
