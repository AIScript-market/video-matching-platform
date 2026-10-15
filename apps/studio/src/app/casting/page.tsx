"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagList } from "@/components/casting-ui";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { type CastingNegotiation, type CastingRole, type Project, type TalentSelf } from "@/lib/casting";
import { useSession } from "@/lib/session";

export default function CastingPage() {
  return (
    <RequireAuth>
      <CastingHome />
    </RequireAuth>
  );
}

function CastingHome() {
  const { has } = useSession();
  const [roles, setRoles] = useState<CastingRole[]>([]);
  const [negotiations, setNegotiations] = useState<CastingNegotiation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [talent, setTalent] = useState<TalentSelf | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        unwrap(api.GET("/casting/roles")),
        unwrap(api.GET("/casting/negotiations")),
        unwrap(api.GET("/projects")),
        unwrap(api.GET("/talent/me")),
      ])
        .then(([r, n, p, t]) => {
          setRoles(r);
          setNegotiations(n);
          setProjects(p);
          setTalent(t && "id" in (t as object) ? (t as TalentSelf) : null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <div className="spread">
        <h1>캐스팅</h1>
        <div className="row">
          {!has("ADMIN") && (
            <Link href="/talent" className="button secondary">
              {talent ? "내 출연자 정보" : "출연자로 등록"}
            </Link>
          )}
          <Link href="/talents" className="button secondary">
            출연자 찾기
          </Link>
        </div>
      </div>
      <ErrorText error={error} />

      {projects.length > 0 && (
        <section className="card stack">
          <h2>내 작품 (기획사)</h2>
          {projects.map((p) => (
            <div key={p.id} className="spread">
              <Link href={`/projects/${p.id}`}>{p.title}</Link>
              <span className="muted small">
                {p.scriptTitle} · {p.members.map((m) => m.displayName).join(", ")}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>캐스팅 협상</h2>
        {negotiations.length === 0 ? (
          <p className="muted small">진행 중인 캐스팅 협상이 없습니다.</p>
        ) : (
          negotiations.map((n) => (
            <div key={n.id} className="spread">
              <span>
                <Link href={`/casting/negotiations/${n.id}`}>
                  {n.projectTitle} · {n.roleName}
                </Link>{" "}
                <span className="muted small">
                  {n.talentStageName}
                  {n.talentIsMinor ? " (미성년)" : ""} · {n.viewerSide === "STUDIO" ? "기획사로 참여" : n.viewerSide === "GUARDIAN" ? "보호자로 참여" : "출연자로 참여"}
                </span>
              </span>
              <span className="row">
                {n.offers.some((o) => o.status === "PENDING_GUARDIAN") && <span className="badge warn">보호자 승인 대기</span>}
                <StatusBadge status={n.status} />
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card stack">
        <h2>공개 오디션</h2>
        {roles.length === 0 && <p className="muted small">지금 캐스팅 중인 배역이 없습니다.</p>}
        {roles.map((r) => (
          <OpenRole key={r.id} role={r} canApply={Boolean(talent && talent.status === "ACTIVE")} onApplied={load} />
        ))}
        {!talent && !has("ADMIN") && (
          <p className="small muted">
            지원하려면 먼저 <Link href="/talent">출연자로 등록</Link>하세요.
          </p>
        )}
      </section>
    </div>
  );
}

function OpenRole({ role, canApply, onApplied }: { role: CastingRole; canApply: boolean; onApplied: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const n = await unwrap(
        api.POST("/casting/roles/{roleId}/applications", { params: { path: { roleId: role.id } }, body: message.trim() ? { message: message.trim() } : {} }),
      );
      router.push(`/casting/negotiations/${n.id}`);
      onApplied();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div className="spread">
        <strong>
          {role.projectTitle} · {role.name}
        </strong>
        {role.isMinorRole && <span className="badge plain">미성년 배역</span>}
      </div>
      {role.description && <p className="small" style={{ margin: 0 }}>{role.description}</p>}
      <span className="small">
        장면 유형: <TagList tags={role.contentTags} /> · {dateTime(role.createdAt)}
      </span>
      {canApply &&
        (open ? (
          <form className="row" onSubmit={apply}>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="지원 메시지 (선택)" style={{ flex: 1, minWidth: 200 }} maxLength={1000} />
            <button type="submit">지원</button>
          </form>
        ) : (
          <div className="row">
            <button className="secondary" onClick={() => setOpen(true)}>
              이 배역에 지원
            </button>
          </div>
        ))}
      <ErrorText error={error} />
    </div>
  );
}
