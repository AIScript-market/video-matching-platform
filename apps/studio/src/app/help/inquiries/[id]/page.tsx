"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { INQUIRY_CATEGORY, INQUIRY_STATUS, type InquiryDetail } from "@/lib/inquiries";
import { useSession } from "@/lib/session";

export default function InquiryPage() {
  const { id } = useParams<{ id: string }>();
  const { has } = useSession();
  const [q, setQ] = useState<InquiryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const path = { params: { path: { id } } };

  const load = useCallback(
    () =>
      unwrap(api.GET("/inquiries/{id}", { params: { path: { id } } }))
        .then(setQ)
        .catch((err: Error) => setError(err.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!q)
    return (
      <div className="stack">
        <p className="small">
          <Link href="/help/inquiries">← 문의 게시판</Link>
        </p>
        <ErrorText error={error} />
      </div>
    );

  return (
    <div className="stack">
      <p className="small">
        <Link href="/help/inquiries">← 문의 게시판</Link>
      </p>
      <section className="card stack" aria-label="문의">
        <div className="spread">
          <h1 style={{ margin: 0 }}>
            {q.isPrivate && <span aria-label="비밀 문의">🔒 </span>}
            {q.title}
          </h1>
          <span className={q.status === "OPEN" ? "badge" : "badge muted"}>{INQUIRY_STATUS[q.status]}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {INQUIRY_CATEGORY[q.category]} · {q.authorName} · {dateTime(q.createdAt)}
          {q.hidden && <strong> · 숨긴 문의 (운영자만 봄)</strong>}
        </p>
        <p className="pre">{q.body}</p>
      </section>

      {q.replies.map((r) => (
        <section key={r.id} className={r.fromStaff ? "card stack notice" : "card stack"} aria-label={r.fromStaff ? "운영자 답변" : "추가 질문"}>
          <p className="small muted" style={{ margin: 0 }}>
            <strong>{r.fromStaff ? "운영자 답변" : `${r.authorName} · 추가 질문`}</strong> · {dateTime(r.createdAt)}
          </p>
          <p className="pre" style={{ margin: 0 }}>
            {r.body}
          </p>
        </section>
      ))}

      <ErrorText error={error} />
      {q.canReply && (
        <form
          className="card stack"
          aria-label="답글 쓰기"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await unwrap(api.POST("/inquiries/{id}/replies", { ...path, body: { body: reply } }));
              setReply("");
            });
          }}
        >
          <label>
            {q.mine ? "더 묻고 싶은 내용" : "답변"}
            <textarea required maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" disabled={busy || !reply.trim()}>
              {q.mine ? "추가 질문 올리기" : "답변 올리기"}
            </button>
            {q.canClose && (
              <button type="button" className="secondary" disabled={busy} onClick={() => void act(() => unwrap(api.POST("/inquiries/{id}/close", path)))}>
                해결됨으로 닫기
              </button>
            )}
            {has("ADMIN") && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void act(() => unwrap(api.POST("/admin/inquiries/{id}/hide", { ...path, body: { hidden: !q.hidden } })))}
              >
                {q.hidden ? "다시 보이기" : "숨기기 (스팸·부적절)"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
