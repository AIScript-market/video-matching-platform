"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagList, WorkStatusBadge } from "@/components/casting-ui";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { TAKEDOWN_REASONS, type TakedownReason, type Work } from "@/lib/casting";
import { useSession } from "@/lib/session";

export default function WorkPage() {
  return (
    <RequireAuth>
      <WorkDetail />
    </RequireAuth>
  );
}

function WorkDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const [work, setWork] = useState<Work | null>(null);
  const [isStudio, setIsStudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/works/{id}", { params: { path: { id } } })), unwrap(api.GET("/projects"))])
        .then(([w, projects]) => {
          setWork(w);
          setIsStudio(projects.some((p) => p.id === w.projectId && p.members.some((m) => m.id === user?.id)));
        })
        .catch((err: Error) => setError(err.message)),
    [id, user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!work) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;

  async function act(run: () => Promise<unknown>) {
    setActionError(null);
    try {
      await run();
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{work.title}</h1>
          <p className="muted small">
            {work.projectTitle} · 장면 <TagList tags={work.contentTags} /> · {work.aiGenerated ? "AI 생성 초상 사용" : "실제 촬영"}
          </p>
        </div>
        <WorkStatusBadge status={work.status} />
      </div>
      {work.externalUrl && (
        <p>
          <a href={work.externalUrl} target="_blank" rel="noreferrer">
            {work.externalUrl}
          </a>
          {work.publishedAt && <span className="muted small"> · {dateTime(work.publishedAt)} 공개</span>}
        </p>
      )}

      <section className="card stack">
        <h2>출연자</h2>
        {work.appearances.map((a) => (
          <div key={a.contractId} className="spread small">
            <span>
              {a.roleName} — <strong>{a.talentStageName}</strong>
            </span>
            <span>{a.requiresApproval ? (a.approvedAt ? <span className="badge ok">확인함</span> : <span className="badge warn">확인 대기</span>) : <span className="badge plain">확인권 없음</span>}</span>
          </div>
        ))}
        {!isStudio && work.status === "DRAFT" && work.appearances.some((a) => a.requiresApproval && !a.approvedAt) && (
          <div className="row">
            <button onClick={() => void act(() => unwrap(api.POST("/works/{id}/approve", { params: { path: { id } } })))}>내 출연분 확인</button>
            <span className="small muted">미성년 출연자의 출연분은 보호자가 확인합니다.</span>
          </div>
        )}
        <ErrorText error={actionError} />
      </section>

      {isStudio && work.status === "DRAFT" && <PublishForm workId={id} aiGenerated={work.aiGenerated} onDone={load} />}
      {!isStudio && work.status !== "REMOVED" && <TakedownForm workId={id} onDone={load} />}

      <p className="small">
        <Link href={isStudio ? `/projects/${work.projectId}` : "/talent"}>← 돌아가기</Link>
      </p>
    </div>
  );
}

function PublishForm({ workId, aiGenerated, onDone }: { workId: string; aiGenerated: boolean; onDone: () => void }) {
  const [externalUrl, setUrl] = useState("");
  const [syntheticLabelApplied, setLabel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(api.POST("/works/{id}/publish", { params: { path: { id: workId } }, body: { externalUrl, syntheticLabelApplied } }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>공개하기</h2>
      <label>
        영상 주소
        <input type="url" value={externalUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
      </label>
      {aiGenerated && (
        <label className="check">
          <input type="checkbox" checked={syntheticLabelApplied} onChange={(e) => setLabel(e.target.checked)} />
          <span>영상에 AI 생성물 표시를 했고, 유튜브 업로드 때 &ldquo;변경되었거나 합성된 콘텐츠&rdquo;를 선택했습니다. (인공지능 기본법, 유튜브 정책)</span>
        </label>
      )}
      <p className="small muted">계약이 진행 중이고, 계약에 있는 장면만 있고, 출연분 확인이 끝나야 공개됩니다.</p>
      <ErrorText error={error} />
      <div className="row">
        <button type="submit">공개</button>
      </div>
    </form>
  );
}

function TakedownForm({ workId, onDone }: { workId: string; onDone: () => void }) {
  const [reason, setReason] = useState<TakedownReason>("OUT_OF_SCOPE");
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = TAKEDOWN_REASONS.find((r) => r.reason === reason)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const t = await unwrap(api.POST("/works/{id}/takedowns", { params: { path: { id: workId } }, body: { reason, details } }));
      setSent(t.interimUnlisted ? "신고를 받았고 작품을 바로 비공개로 돌렸습니다. 운영팀이 7일 안에 판단합니다." : "요청을 보냈습니다. 작품은 기획사와 합의할 때까지 공개 상태로 남습니다.");
      setDetails("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>작품 내림 요청</h2>
      <label>
        사유
        <select value={reason} onChange={(e) => setReason(e.target.value as TakedownReason)}>
          {TAKEDOWN_REASONS.map((r) => (
            <option key={r.reason} value={r.reason}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">
        {selected.immediate
          ? "계약 위반 사유는 신고하는 즉시 비공개되고 운영팀이 7일 안에 판단합니다."
          : "계약대로 만든 작품은 일방적으로 내릴 수 없습니다. 기획사와 합의하거나, 조기 종료 보상을 내고 계약을 끝낼 수 있습니다."}
      </p>
      <label>
        자세한 내용 (몇 분 몇 초, 어떤 장면 등)
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} required maxLength={2000} />
      </label>
      {sent && <p className="notice small">{sent}</p>}
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" className="danger" disabled={!details.trim()}>
          요청 보내기
        </button>
      </div>
    </form>
  );
}
