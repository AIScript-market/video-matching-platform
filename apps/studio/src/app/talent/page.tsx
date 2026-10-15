"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TagList, TagPicker, WorkStatusBadge } from "@/components/casting-ui";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, won } from "@/lib/api";
import {
  dateOnly,
  feeSummary,
  STEP_LABEL,
  uploadForm,
  type AccessLogEntry,
  type CastingContract,
  type ContentTag,
  type Identity,
  type TalentSelf,
} from "@/lib/casting";
import { useSession } from "@/lib/session";

const POLICY_VERSION = "likeness-policy-v1";

export default function TalentPage() {
  return (
    <RequireAuth>
      <TalentHome />
    </RequireAuth>
  );
}

function TalentHome() {
  const { has } = useSession();
  const [talent, setTalent] = useState<TalentSelf | null | undefined>(undefined);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/talent/me")), unwrap(api.GET("/identity-verification"))])
        .then(([t, i]) => {
          // 등록 전·인증 전이면 API가 빈 응답(null)을 준다
          setTalent(t && "id" in (t as object) ? (t as TalentSelf) : null);
          setIdentity(i && "legalName" in (i as object) ? (i as Identity) : null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (has("ADMIN")) return <p className="muted">관리자 계정은 출연자로 등록할 수 없습니다.</p>;
  if (talent === undefined) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;

  return (
    <div className="stack">
      <div className="spread">
        <h1>출연자</h1>
        <div className="row">
          <Link href="/casting" className="button secondary">
            오디션·캐스팅
          </Link>
          <Link href="/guardian" className="button secondary">
            보호자 화면
          </Link>
        </div>
      </div>
      {talent ? <Registered talent={talent} identity={identity} onChange={load} /> : <CreateProfile onCreated={load} />}
    </div>
  );
}

function CreateProfile({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<"ACTOR" | "GENERAL">("GENERAL");
  const [stageName, setStageName] = useState("");
  const [bio, setBio] = useState("");
  const [allowedTags, setTags] = useState<ContentTag[]>(["ROMANCE"]);
  const [minFeeKrw, setMinFee] = useState(0);
  const [minor, setMinor] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/talent/profile", {
          body: {
            kind,
            stageName,
            allowedTags,
            minFeeKrw,
            ...(bio.trim() ? { bio: bio.trim() } : {}),
            ...(minor && guardianEmail.trim() ? { guardianEmail: guardianEmail.trim() } : {}),
          },
        }),
      );
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>출연자로 등록하기</h2>
      <p className="muted small">
        내 얼굴과 목소리를 등록해 두면, 기획사가 작품의 배역으로 캐스팅할 때 출연료를 협상하고 계약할 수 있습니다. 등록은 언제든 철회할 수 있고,
        계약 밖의 사용은 바로 내려갑니다.{" "}
        <a href="https://github.com/zerohoon123/video-matching-platform/blob/main/docs/policies/likeness-policy.md" target="_blank" rel="noreferrer">
          기준 전문 보기
        </a>
      </p>
      <div className="row">
        <label className="check">
          <input type="radio" name="kind" checked={kind === "GENERAL"} onChange={() => setKind("GENERAL")} />
          <span>일반인</span>
        </label>
        <label className="check">
          <input type="radio" name="kind" checked={kind === "ACTOR"} onChange={() => setKind("ACTOR")} />
          <span>배우</span>
        </label>
      </div>
      <label>
        활동명 (캐스팅 목록에 보이는 이름)
        <input value={stageName} onChange={(e) => setStageName(e.target.value)} required maxLength={40} />
      </label>
      <label>
        소개 (선택)
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} />
      </label>
      <TagPicker legend="출연해도 괜찮은 장면 (체크하지 않은 장면이 있는 배역에는 제안이 오지 않습니다)" value={allowedTags} onChange={setTags} />
      <label>
        최저 출연료 (원)
        <input type="number" min={0} step={10000} value={minFeeKrw} onChange={(e) => setMinFee(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} />
        <span>만 19세 미만입니다 (법정대리인이 함께 계약합니다)</span>
      </label>
      {minor && (
        <label>
          보호자 이메일 (보호자가 이 이메일로 가입해 동의합니다)
          <input type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} required />
        </label>
      )}
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy || !stageName.trim()}>
          {busy ? "등록하는 중…" : "등록 시작"}
        </button>
      </div>
    </form>
  );
}

function Registered({ talent, identity, onChange }: { talent: TalentSelf; identity: Identity | null; onChange: () => void }) {
  const steps = talent.missingSteps;
  const withdrawing = talent.status === "WITHDRAWING" || talent.status === "WITHDRAWN";
  return (
    <div className="stack">
      <section className="card stack">
        <div className="spread">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              {talent.stageName} <span className="muted small">{talent.kind === "ACTOR" ? "배우" : "일반인"}</span>
            </h2>
            <p className="small muted" style={{ margin: 0 }}>
              최저 출연료 {won(talent.minFeeKrw)} · 허용 장면 <TagList tags={talent.allowedTags} />
            </p>
          </div>
          <TalentStatus status={talent.status} />
        </div>
        {!withdrawing && steps.length > 0 && (
          <p className="notice small">
            남은 단계: {steps.map((s) => STEP_LABEL[s]).join(" → ")}
          </p>
        )}
        {talent.isMinor && (
          <p className="small">
            미성년 출연자입니다. 보호자({talent.guardianEmail ?? "미입력"}) {talent.guardianLinked ? "연결됨" : "연결 전"}. 모든 계약과 출연분 확인은 보호자가 합니다.
          </p>
        )}
      </section>

      {!withdrawing && (
        <>
          <IdentityStep identity={identity} done={!steps.includes("IDENTITY")} onDone={onChange} />
          <FaceStep talent={talent} onDone={onChange} />
          <ConsentStep done={!steps.includes("CONSENT") && !steps.includes("ADULT_RECONSENT")} onDone={onChange} />
        </>
      )}

      <MyContracts />
      <AccessLogs />
      <Withdrawal talent={talent} onChange={onChange} />
    </div>
  );
}

function TalentStatus({ status }: { status: TalentSelf["status"] }) {
  const map: Record<TalentSelf["status"], [string, string]> = {
    PENDING_VERIFICATION: ["등록 진행 중", "warn"],
    ACTIVE: ["캐스팅 가능", "ok"],
    WITHDRAWING: ["철회 진행 중", "bad"],
    WITHDRAWN: ["철회 완료", "plain"],
  };
  const [label, tone] = map[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

function StepCard({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="card stack">
      <div className="spread">
        <h3 style={{ margin: 0 }}>
          {n}. {title}
        </h3>
        {done ? <span className="badge ok">완료</span> : <span className="badge warn">필요</span>}
      </div>
      {children}
    </section>
  );
}

function IdentityStep({ identity, done, onDone }: { identity: Identity | null; done: boolean; onDone: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(api.POST("/identity-verification", { body: { token } }));
      setToken("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <StepCard n={1} title="본인인증" done={done}>
      {identity ? (
        <p className="small" style={{ margin: 0 }}>
          {identity.legalName} · {identity.isMinor ? `미성년자 (만 19세: ${identity.adultOn ? dateOnly(identity.adultOn) : "-"})` : "성인"} · {dateTime(identity.verifiedAt)} 인증
        </p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="small muted" style={{ margin: 0 }}>
            시범 환경은 실제 휴대폰 본인인증 대신 <code>test:실명:생년월일</code> 형식의 가짜 토큰을 씁니다. 생년월일은 저장하지 않습니다.
          </p>
          <div className="row">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="test:홍길동:1998-03-14" style={{ flex: 1, minWidth: 220 }} />
            <button type="submit" disabled={!token.trim()}>
              인증
            </button>
          </div>
          <ErrorText error={error} />
        </form>
      )}
    </StepCard>
  );
}

function FaceStep({ talent, onDone }: { talent: TalentSelf; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const face = talent.assets.filter((a) => a.kind === "FACE_SCAN");

  async function upload(kind: "FACE_SCAN" | "VOICE", file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      await uploadForm("/talent/me/assets", form);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function selfie(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("selfie", file);
      await uploadForm("/talent/me/liveness", form);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard n={2} title="얼굴 스캔과 셀카 확인" done={!talent.missingSteps.includes("FACE_SCAN") && !talent.missingSteps.includes("LIVENESS")}>
      <p className="small muted" style={{ margin: 0 }}>
        올린 파일은 파일마다 다른 키로 암호화해 보관하고, 본인과 계약한 기획사만 제작 기한 안에 받을 수 있습니다. 받을 때마다 아래 기록에 남습니다.
      </p>
      <div className="row">
        <label className="button secondary" style={{ cursor: "pointer" }}>
          얼굴 스캔 올리기 (사진·영상)
          <input type="file" accept="image/*,video/*" hidden disabled={busy} onChange={(e) => void upload("FACE_SCAN", e.target.files?.[0])} />
        </label>
        <label className="button secondary" style={{ cursor: face.length ? "pointer" : "not-allowed", opacity: face.length ? 1 : 0.5 }}>
          지금 셀카 찍어 확인
          <input type="file" accept="image/*" capture="user" hidden disabled={busy || !face.length} onChange={(e) => void selfie(e.target.files?.[0])} />
        </label>
        <label className="button ghost" style={{ cursor: "pointer" }}>
          음성 올리기 (선택)
          <input type="file" accept="audio/*" hidden disabled={busy} onChange={(e) => void upload("VOICE", e.target.files?.[0])} />
        </label>
      </div>
      {talent.assets.length > 0 && (
        <ul className="small" style={{ margin: 0 }}>
          {talent.assets.map((a) => (
            <li key={a.id}>
              {a.kind === "FACE_SCAN" ? "얼굴 스캔" : a.kind === "VOICE" ? "음성" : "동작"} · {(a.sizeBytes / 1024).toFixed(1)}KB · {dateTime(a.createdAt)}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        시범 환경의 셀카 확인은 가짜입니다. 파일 이름이 아니라 내용에 <code>MISMATCH</code>가 들어 있으면 다른 사람으로 판정됩니다.
      </p>
      <ErrorText error={error} />
    </StepCard>
  );
}

function ConsentStep({ done, onDone }: { done: boolean; onDone: () => void }) {
  const [sensitiveData, setSensitive] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(api.POST("/talent/me/consent", { body: { policyVersion: POLICY_VERSION, sensitiveData, crossBorder } }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <StepCard n={3} title="동의" done={done}>
      {done ? (
        <p className="small muted" style={{ margin: 0 }}>
          {POLICY_VERSION}에 동의했습니다.
        </p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="check">
            <input type="checkbox" checked={sensitiveData} onChange={(e) => setSensitive(e.target.checked)} />
            <span>얼굴·음성(민감정보)을 출연 계약에 쓰기 위해 처리하는 데 동의합니다.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} />
            <span>영상 생성에 해외 AI 서비스를 쓸 수 있어 국외로 처리될 수 있음을 확인했습니다.</span>
          </label>
          <ErrorText error={error} />
          <div className="row">
            <button type="submit" disabled={!sensitiveData || !crossBorder}>
              동의
            </button>
          </div>
        </form>
      )}
    </StepCard>
  );
}

function MyContracts() {
  const [contracts, setContracts] = useState<CastingContract[]>([]);
  const [works, setWorks] = useState<Awaited<ReturnType<typeof loadWorks>>>([]);
  const [error, setError] = useState<string | null>(null);
  const loadAll = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/casting/contracts")), loadWorks()])
        .then(([c, w]) => {
          setContracts(c);
          setWorks(w);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <section className="card stack">
      <h2>내 출연 계약과 작품</h2>
      <ErrorText error={error} />
      {contracts.length === 0 && <p className="muted small">아직 계약이 없습니다. <Link href="/casting">오디션 보기 →</Link></p>}
      {contracts.map((c) => (
        <div key={c.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="spread">
            <strong>
              {c.projectTitle} · {c.roleName}
            </strong>
            <StatusBadge status={c.status} />
          </div>
          <span className="small">
            {feeSummary(c)} · {dateOnly(c.startsAt)} ~ {dateOnly(c.endsAt)} · 제작 기한 {dateOnly(c.productionEndsAt)} · 장면 <TagList tags={c.contentTags} />
          </span>
        </div>
      ))}
      {works.length > 0 && <h3>출연한 작품</h3>}
      {works.map((w) => (
        <div key={w.id} className="spread">
          <span>
            <Link href={`/works/${w.id}`}>{w.title}</Link> <span className="muted small">{w.projectTitle}</span>
          </span>
          <WorkStatusBadge status={w.status} />
        </div>
      ))}
    </section>
  );
}

async function loadWorks() {
  return unwrap(api.GET("/works"));
}

function AccessLogs() {
  const [logs, setLogs] = useState<AccessLogEntry[]>([]);
  useEffect(() => {
    unwrap(api.GET("/talent/me/access-logs")).then(setLogs).catch(() => setLogs([]));
  }, []);
  return (
    <section className="card stack">
      <h2>원본 열람 기록</h2>
      {logs.length === 0 ? (
        <p className="muted small">아직 내려받은 사람이 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>누가</th>
                <th>목적</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{dateTime(l.accessedAt)}</td>
                  <td>{l.userDisplayName}</td>
                  <td>{l.purpose === "SELF" ? "본인" : "제작 (계약)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Withdrawal({ talent, onChange }: { talent: TalentSelf; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: "/talent/me/withdraw" | "/talent/me/withdraw/cancel") {
    setError(null);
    try {
      await unwrap(api.POST(path));
      setConfirming(false);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (talent.status === "WITHDRAWN") return <p className="muted small">등록을 철회했고 원본은 삭제되었습니다.</p>;
  return (
    <section className="card stack">
      <h2>등록 철회</h2>
      {talent.status === "WITHDRAWING" ? (
        <>
          <p className="small">
            철회 진행 중입니다. 원본은 {talent.purgeAfter ? dateTime(talent.purgeAfter) : "-"}에 삭제됩니다. 철회 후 7일 안에는 취소할 수 있습니다.
          </p>
          <div className="row">
            <button className="secondary" onClick={() => void act("/talent/me/withdraw/cancel")}>
              철회 취소
            </button>
          </div>
        </>
      ) : confirming ? (
        <>
          <p className="small">
            철회하면 새 제안을 받을 수 없고, 7일 뒤(진행 중인 계약이 있으면 그 제작 기한 뒤) 얼굴·음성 원본이 삭제됩니다. 이미 계약대로 공개된 작품은 계약 기간 동안
            유지됩니다.
          </p>
          <div className="row">
            <button className="danger" onClick={() => void act("/talent/me/withdraw")}>
              철회하기
            </button>
            <button className="ghost" onClick={() => setConfirming(false)}>
              그만두기
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="ghost" onClick={() => setConfirming(true)}>
            등록 철회…
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </section>
  );
}
