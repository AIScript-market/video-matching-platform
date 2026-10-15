"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagList, TagPicker, WorkStatusBadge } from "@/components/casting-ui";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import {
  dateOnly,
  feeSummary,
  TAKEDOWN_LABEL,
  type CastingContract,
  type CastingRole,
  type ContentTag,
  type Project,
  type Takedown,
  type Work,
} from "@/lib/casting";

export default function ProjectPage() {
  return (
    <RequireAuth>
      <ProjectDetail />
    </RequireAuth>
  );
}

function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [roles, setRoles] = useState<CastingRole[]>([]);
  const [contracts, setContracts] = useState<CastingContract[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [takedowns, setTakedowns] = useState<Takedown[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        unwrap(api.GET("/projects/{id}", { params: { path: { id } } })),
        unwrap(api.GET("/projects/{id}/roles", { params: { path: { id } } })),
        unwrap(api.GET("/casting/contracts")),
        unwrap(api.GET("/projects/{id}/works", { params: { path: { id } } })),
        unwrap(api.GET("/takedowns")),
      ])
        .then(([p, r, c, w, t]) => {
          setProject(p);
          setRoles(r);
          setContracts(c.filter((x) => x.projectId === id));
          setWorks(w);
          setTakedowns(t.filter((x) => w.some((work) => work.id === x.workId)));
        })
        .catch((err: Error) => setError(err.message)),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!project) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{project.title}</h1>
          <p className="muted small">
            원작 대본 {project.scriptTitle} · 기획사 {project.members.map((m) => m.displayName).join(", ")}
          </p>
        </div>
        <Link href={`/deals/${project.dealId}`} className="button secondary">
          딜 보기
        </Link>
      </div>
      <ErrorText error={error} />

      <section className="card stack">
        <div className="spread">
          <h2>배역</h2>
          <Link href="/talents" className="small">
            출연자 찾아 제안하기 →
          </Link>
        </div>
        {roles.length === 0 && <p className="muted small">아직 배역이 없습니다.</p>}
        {roles.map((r) => (
          <div key={r.id} className="spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>
              <strong>{r.name}</strong> {r.isMinorRole && <span className="badge plain">미성년 배역</span>}
              <br />
              <span className="small">
                장면 <TagList tags={r.contentTags} />
              </span>
            </span>
            <span className={`badge ${r.status === "OPEN" ? "warn" : r.status === "CAST" ? "ok" : "plain"}`}>
              {r.status === "OPEN" ? "오디션 중" : r.status === "CAST" ? "캐스팅 완료" : "마감"}
            </span>
          </div>
        ))}
        <NewRole projectId={id} onCreated={load} />
      </section>

      <section className="card stack">
        <h2>출연 계약</h2>
        {contracts.length === 0 && <p className="muted small">아직 계약이 없습니다.</p>}
        {contracts.map((c) => (
          <div key={c.id} className="spread small">
            <span>
              <strong>{c.roleName}</strong> — {c.talentStageName} · {feeSummary(c)} · 제작 기한 {dateOnly(c.productionEndsAt)} · 공개 {dateOnly(c.endsAt)}까지
              {c.guardianApprovedAt ? " · 보호자 승인" : ""}
            </span>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>작품</h2>
        {works.map((w) => (
          <div key={w.id} className="spread">
            <span>
              <Link href={`/works/${w.id}`}>{w.title}</Link>{" "}
              <span className="small muted">
                {w.appearances.map((a) => `${a.talentStageName}${a.requiresApproval ? (a.approvedAt ? " ✓" : " (확인 대기)") : ""}`).join(", ")}
              </span>
            </span>
            <WorkStatusBadge status={w.status} />
          </div>
        ))}
        {contracts.some((c) => c.status === "ACTIVE") ? (
          <NewWork projectId={id} contracts={contracts.filter((c) => c.status === "ACTIVE")} onCreated={load} />
        ) : (
          <p className="muted small">진행 중인 출연 계약이 있어야 작품을 만들 수 있습니다.</p>
        )}
      </section>

      {takedowns.length > 0 && (
        <section className="card stack">
          <h2>내림 요청</h2>
          {takedowns.map((t) => (
            <TakedownRow key={t.id} takedown={t} onDone={load} />
          ))}
        </section>
      )}
    </div>
  );
}

function NewRole({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isMinorRole, setMinor] = useState(false);
  const [contentTags, setTags] = useState<ContentTag[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(
        api.POST("/projects/{id}/roles", {
          params: { path: { id: projectId } },
          body: { name, isMinorRole, contentTags, ...(description.trim() ? { description: description.trim() } : {}) },
        }),
      );
      setName("");
      setDescription("");
      setTags([]);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <details>
      <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
        + 배역 추가
      </summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
        <label>
          배역 이름
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <label>
          설명 (선택)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} style={{ minHeight: 64 }} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={isMinorRole}
            onChange={(e) => {
              setMinor(e.target.checked);
              if (e.target.checked) setTags(contentTags.filter((t) => t !== "INTIMACY" && t !== "SUBSTANCE"));
            }}
          />
          <span>만 19세 미만 인물 (학원물 학생 등)</span>
        </label>
        <TagPicker legend="이 배역에 들어가는 장면" value={contentTags} onChange={setTags} minorOnly={isMinorRole} />
        <ErrorText error={error} />
        <div className="row">
          <button type="submit" disabled={!name.trim()}>
            배역 등록
          </button>
        </div>
      </form>
    </details>
  );
}

function NewWork({ projectId, contracts, onCreated }: { projectId: string; contracts: CastingContract[]; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [contractIds, setContractIds] = useState<string[]>([]);
  const [contentTags, setTags] = useState<ContentTag[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(api.POST("/projects/{id}/works", { params: { path: { id: projectId } }, body: { title, contractIds, contentTags, aiGenerated: true } }));
      setTitle("");
      setContractIds([]);
      setTags([]);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <details>
      <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
        + 작품 등록 (회차·숏폼)
      </summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
        <label>
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>
        <fieldset className="stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>출연자</legend>
          {contracts.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={contractIds.includes(c.id)}
                onChange={(e) => setContractIds(e.target.checked ? [...contractIds, c.id] : contractIds.filter((x) => x !== c.id))}
              />
              <span>
                {c.roleName} — {c.talentStageName} <span className="muted small">(계약 장면: {c.contentTags.length ? c.contentTags.join(", ") : "없음"})</span>
              </span>
            </label>
          ))}
        </fieldset>
        <TagPicker legend="이 작품에 실제로 들어간 장면 (계약에 없는 장면이면 등록되지 않습니다)" value={contentTags} onChange={setTags} />
        <ErrorText error={error} />
        <div className="row">
          <button type="submit" disabled={!title.trim() || contractIds.length === 0}>
            작품 등록
          </button>
        </div>
      </form>
    </details>
  );
}

function TakedownRow({ takedown, onDone }: { takedown: Takedown; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function settle() {
    setError(null);
    try {
      await unwrap(api.POST("/takedowns/{id}/settle", { params: { path: { id: takedown.id } }, body: { resolution: "기획사가 요청에 합의해 내림" } }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="stack" style={{ gap: 4, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <div className="spread">
        <strong>{takedown.workTitle}</strong>
        <span className={`badge ${takedown.status === "OPEN" ? "warn" : "plain"}`}>{takedown.status === "OPEN" ? "검토 중" : takedown.status}</span>
      </div>
      <span className="small">
        {TAKEDOWN_LABEL[takedown.reason]} · {dateTime(takedown.createdAt)}
        {takedown.interimUnlisted ? " · 신고와 함께 비공개 처리됨" : ""}
      </span>
      <span className="small pre muted">{takedown.details}</span>
      {takedown.status === "OPEN" && (
        <div className="row">
          <button className="ghost" onClick={() => void settle()}>
            합의하고 작품 내리기
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
