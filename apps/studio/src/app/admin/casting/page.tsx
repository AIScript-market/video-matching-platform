"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { TAKEDOWN_LABEL, type Takedown, type Ward } from "@/lib/casting";

export default function AdminCastingPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminCasting />
    </RequireAuth>
  );
}

function AdminCasting() {
  const [checks, setChecks] = useState<Ward[]>([]);
  const [takedowns, setTakedowns] = useState<Takedown[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/admin/talent/guardian-checks")), unwrap(api.GET("/takedowns"))])
        .then(([c, t]) => {
          setChecks(c);
          setTakedowns(t);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <h1>출연 관리</h1>
      <ErrorText error={error} />

      <section className="card stack">
        <h2>보호자 관계 확인</h2>
        <p className="small muted">가족관계증명서 등으로 보호자 관계를 확인한 뒤 완료로 표시합니다. 확인 전에는 미성년 출연자를 캐스팅할 수 없습니다.</p>
        {checks.length === 0 && <p className="muted small">확인을 기다리는 출연자가 없습니다.</p>}
        {checks.map((w) => (
          <div key={w.talentId} className="spread">
            <span>
              {w.stageName} <span className="small muted">보호자 동의 {w.guardianConsentAt ? dateTime(w.guardianConsentAt) : "-"}</span>
            </span>
            <button onClick={() => void run(() => unwrap(api.POST("/admin/talent/{talentId}/guardian-verified", { params: { path: { talentId: w.talentId } } })))}>
              관계 확인 완료
            </button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>작품 내림 요청 (처리 대기)</h2>
        <p className="small muted">
          계약 위반 사유는 신고와 함께 이미 비공개 상태입니다. 7일 안에 판단합니다. 인정하면 작품을 삭제하고, 기각하면 다시 공개합니다.
        </p>
        {takedowns.length === 0 && <p className="muted small">처리할 요청이 없습니다.</p>}
        {takedowns.map((t) => (
          <div key={t.id} className="stack" style={{ gap: 4, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div className="spread">
              <Link href={`/works/${t.workId}`}>{t.workTitle}</Link>
              <span className={`badge ${t.interimUnlisted ? "bad" : "plain"}`}>{t.interimUnlisted ? "비공개 중" : "공개 유지"}</span>
            </div>
            <span className="small">
              {TAKEDOWN_LABEL[t.reason]} · 접수 {dateTime(t.createdAt)}
              {t.reviewDueAt ? ` · 판단 기한 ${dateTime(t.reviewDueAt)}` : ""}
            </span>
            <span className="small pre muted">{t.details}</span>
            <div className="row">
              <button className="danger" onClick={() => void run(() => unwrap(api.POST("/admin/takedowns/{id}/decide", { params: { path: { id: t.id } }, body: { uphold: true, resolution: "신고 인정" } })))}>
                인정 (삭제)
              </button>
              <button className="ghost" onClick={() => void run(() => unwrap(api.POST("/admin/takedowns/{id}/decide", { params: { path: { id: t.id } }, body: { uphold: false, resolution: "계약 범위 안으로 판단" } })))}>
                기각
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
