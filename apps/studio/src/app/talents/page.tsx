"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagList } from "@/components/casting-ui";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, unwrap, won } from "@/lib/api";
import { CONTENT_TAGS, type CastingRole, type ContentTag, type Project, type TalentPublic } from "@/lib/casting";

export default function TalentsPage() {
  return (
    <RequireAuth>
      <Directory />
    </RequireAuth>
  );
}

function Directory() {
  const [tag, setTag] = useState<ContentTag | "">("");
  const [kind, setKind] = useState<"" | "ACTOR" | "GENERAL">("");
  const [talents, setTalents] = useState<TalentPublic[]>([]);
  const [roles, setRoles] = useState<CastingRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/talent", { params: { query: { ...(tag ? { tag } : {}), ...(kind ? { kind } : {}) } } }))
        .then(setTalents)
        .catch((err: Error) => setError(err.message)),
    [tag, kind],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 내가 기획사인 작품의 캐스팅 중인 배역 (직접 제안용)
  useEffect(() => {
    unwrap(api.GET("/projects"))
      .then((projects: Project[]) =>
        Promise.all(projects.map((p) => unwrap(api.GET("/projects/{id}/roles", { params: { path: { id: p.id } } })))),
      )
      .then((lists) => setRoles(lists.flat().filter((r) => r.status === "OPEN")))
      .catch(() => setRoles([]));
  }, []);

  return (
    <div className="stack">
      <h1>출연자 찾기</h1>
      <p className="muted small">등록을 마친 출연자만 보입니다. 실명과 얼굴 원본은 공개되지 않고, 계약한 기획사만 제작 기한 안에 원본을 받을 수 있습니다.</p>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ width: "auto" }} aria-label="출연자 종류">
          <option value="">전체</option>
          <option value="ACTOR">배우</option>
          <option value="GENERAL">일반인</option>
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value as ContentTag | "")} style={{ width: "auto" }} aria-label="허용 장면">
          <option value="">모든 장면</option>
          {CONTENT_TAGS.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.label} 허용
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      <div className="grid">
        {talents.map((t) => (
          <TalentCard key={t.id} talent={t} roles={roles} />
        ))}
      </div>
      {talents.length === 0 && <p className="muted">조건에 맞는 출연자가 없습니다.</p>}
    </div>
  );
}

function TalentCard({ talent, roles }: { talent: TalentPublic; roles: CastingRole[] }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    try {
      const n = await unwrap(api.POST("/casting/roles/{roleId}/invitations", { params: { path: { roleId } }, body: { talentId: talent.id } }));
      setMessage("제안을 시작했습니다");
      router.push(`/casting/negotiations/${n.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="spread">
        <strong>{talent.stageName}</strong>
        <span className="row">
          <span className="badge plain">{talent.kind === "ACTOR" ? "배우" : "일반인"}</span>
          {talent.isMinor && <span className="badge warn">미성년</span>}
        </span>
      </div>
      {talent.bio && <p className="small" style={{ margin: 0 }}>{talent.bio}</p>}
      <span className="small">
        허용 장면 <TagList tags={talent.allowedTags} />
      </span>
      <span className="small muted">최저 출연료 {won(talent.minFeeKrw)}</span>
      {roles.length > 0 && (
        <div className="row">
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ flex: 1, minWidth: 140 }} aria-label="제안할 배역">
            <option value="">내 배역 선택…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.projectTitle} · {r.name}
              </option>
            ))}
          </select>
          <button className="secondary" disabled={!roleId} onClick={() => void invite()}>
            출연 제안
          </button>
        </div>
      )}
      {message && <p className="small">{message}</p>}
      <ErrorText error={error} />
    </article>
  );
}
