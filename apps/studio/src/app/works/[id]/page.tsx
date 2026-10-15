"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TagList, WorkStatusBadge } from "@/components/casting-ui";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap, type Schemas } from "@/lib/api";
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
      {work.publishedAt && <PerformanceSection workId={id} canRecord={isStudio} />}
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

type Snapshot = Schemas["PerformanceSnapshotDto"];

/** 작품 성과. 흥행 판단 모델의 정답 데이터가 된다 (지금은 직접 입력, 나중에 유튜브 분석 API) */
function PerformanceSection({ workId, canRecord }: { workId: string; canRecord: boolean }) {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [form, setForm] = useState({ views: 0, likes: 0, comments: 0, positiveComments: 0, channelSubscribers: 0, avgViewDurationSec: 0, subscribersGained: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/works/{id}/performance", { params: { path: { id: workId } } }))
        .then(setRows)
        .catch((err: Error) => setError(err.message)),
    [workId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(
        api.POST("/works/{id}/performance", {
          params: { path: { id: workId } },
          body: { capturedAt: new Date().toISOString(), ...form },
        }),
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const field = (key: keyof typeof form, label: string) => (
    <label style={{ flex: 1, minWidth: 120 }}>
      {label}
      <input
        type="number"
        min={0}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
      />
    </label>
  );
  const n = (v: number | null) => (v === null ? "-" : v.toLocaleString("ko-KR"));

  return (
    <section className="card stack">
      <h2>성과</h2>
      {rows.length === 0 ? (
        <p className="muted small">아직 기록이 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>확인 시각</th>
                <th className="num">조회수</th>
                <th className="num">좋아요</th>
                <th className="num">댓글 (긍정)</th>
                <th className="num">채널 구독자</th>
                <th className="num">평균 시청(초)</th>
                <th className="num">구독 증가</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.capturedAt)}</td>
                  <td className="num">{n(r.views)}</td>
                  <td className="num">{n(r.likes)}</td>
                  <td className="num">
                    {n(r.comments)} ({n(r.positiveComments)})
                  </td>
                  <td className="num">{n(r.channelSubscribers)}</td>
                  <td className="num">{n(r.avgViewDurationSec)}</td>
                  <td className="num">{n(r.subscribersGained)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canRecord && (
        <form className="stack" onSubmit={submit} aria-label="성과 기록" style={{ gap: 8 }}>
          <div className="row">
            {field("views", "조회수")}
            {field("likes", "좋아요")}
            {field("comments", "댓글")}
            {field("positiveComments", "긍정 댓글")}
          </div>
          <div className="row">
            {field("channelSubscribers", "채널 구독자 (공개 시점)")}
            {field("avgViewDurationSec", "평균 시청(초)")}
            {field("subscribersGained", "구독 증가")}
          </div>
          <CommentCounter onCounted={(c) => setForm({ ...form, comments: c.total, positiveComments: c.positive })} />
          <div className="row">
            <button type="submit">지금 숫자 기록</button>
          </div>
        </form>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        유튜브 스튜디오의 숫자를 옮겨 적습니다. 채널 구독자 수로 채널 크기 차이를 보정하고, 작가가 학습에 동의한 대본의 작품만 흥행 판단 모델의 학습에
        쓰입니다.
      </p>
      <ErrorText error={error} />
    </section>
  );
}

/** 댓글을 붙여 넣으면 긍정 댓글 수를 센다. 댓글은 저장하지 않는다 */
function CommentCounter({ onCounted }: { onCounted: (c: Schemas["CommentSentimentDto"]) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Schemas["CommentSentimentDto"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function count() {
    setError(null);
    const comments = text
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 2000);
    try {
      const r = await unwrap(api.POST("/ml/comment-sentiment", { body: { comments } }));
      setResult(r);
      onCounted(r);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <details>
      <summary className="small">댓글 붙여 넣어 긍정 댓글 세기</summary>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글을 한 줄에 하나씩 붙여 넣으세요 (최대 2,000개)" />
        <div className="row">
          <button type="button" className="secondary" onClick={count} disabled={!text.trim()}>
            세기
          </button>
          {result && (
            <span className="small muted">
              {result.total}개 중 긍정 {result.positive} · 부정 {result.negative} · 중립 {result.neutral} ({result.version})
            </span>
          )}
        </div>
        <ErrorText error={error} />
      </div>
    </details>
  );
}

