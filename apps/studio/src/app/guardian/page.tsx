"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { type CastingNegotiation, type Identity, type Ward } from "@/lib/casting";

export default function GuardianPage() {
  return (
    <RequireAuth>
      <GuardianHome />
    </RequireAuth>
  );
}

function GuardianHome() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pending, setPending] = useState<CastingNegotiation[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/guardian/wards")), unwrap(api.GET("/identity-verification")), unwrap(api.GET("/casting/negotiations"))])
        .then(([w, i, n]) => {
          setWards(w);
          setIdentity(i && "legalName" in (i as object) ? (i as Identity) : null);
          setPending(n.filter((x) => x.viewerSide === "GUARDIAN"));
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
      <h1>보호자</h1>
      <p className="muted small">
        만 19세 미만 출연자가 등록할 때 적은 이메일이 이 계정의 이메일이면 여기에 나타납니다. 보호자는 등록에 동의하고, 모든 출연 계약과 출연분 확인을 대신 결정합니다.
      </p>
      <ErrorText error={error} />

      <section className="card stack">
        <h2>1. 보호자 본인인증</h2>
        {identity ? (
          <p className="small" style={{ margin: 0 }}>
            {identity.legalName} · {identity.isMinor ? "미성년자는 보호자가 될 수 없습니다" : "성인"} · {dateTime(identity.verifiedAt)} 인증
          </p>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => unwrap(api.POST("/identity-verification", { body: { token } })));
            }}
          >
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="test:실명:1980-01-01 (시범용 가짜 인증)" style={{ flex: 1, minWidth: 220 }} />
            <button type="submit" disabled={!token.trim()}>
              인증
            </button>
          </form>
        )}
      </section>

      <section className="card stack">
        <h2>2. 대리하는 출연자</h2>
        {wards.length === 0 && <p className="muted small">아직 이 이메일로 보호자 요청을 보낸 출연자가 없습니다.</p>}
        {wards.map((w) => (
          <div key={w.talentId} className="spread">
            <span>
              <strong>{w.stageName}</strong>{" "}
              <span className="small muted">
                {w.guardianConsentAt ? `동의 ${dateTime(w.guardianConsentAt)}` : "동의 전"} ·{" "}
                {w.guardianVerifiedAt ? "관계 확인 완료" : "운영팀 관계 확인 대기 (가족관계증명서)"}
              </span>
            </span>
            {!w.guardianConsentAt && (
              <button disabled={!identity} onClick={() => void run(() => unwrap(api.POST("/guardian/wards/{talentId}/consent", { params: { path: { talentId: w.talentId } } })))}>
                보호자로 동의
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>3. 결정할 캐스팅</h2>
        {pending.length === 0 && <p className="muted small">대리하는 출연자의 캐스팅 협상이 없습니다.</p>}
        {pending.map((n) => (
          <div key={n.id} className="spread">
            <Link href={`/casting/negotiations/${n.id}`}>
              {n.projectTitle} · {n.roleName} ({n.talentStageName})
            </Link>
            {n.offers.some((o) => o.status === "PENDING_GUARDIAN") ? <span className="badge warn">승인 필요</span> : <span className="badge plain">{n.status}</span>}
          </div>
        ))}
        <p className="small muted">
          출연분 확인은 <Link href="/talent">출연 작품</Link>이 아니라 각 작품 화면에서 합니다. 보호자 계정으로 작품 링크를 열면 확인 버튼이 보입니다.
        </p>
      </section>
    </div>
  );
}
