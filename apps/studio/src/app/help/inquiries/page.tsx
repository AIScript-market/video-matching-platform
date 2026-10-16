"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { INQUIRY_CATEGORY, INQUIRY_STATUS, isReadable, type InquirySummary } from "@/lib/inquiries";
import { useSession } from "@/lib/session";

type Category = InquirySummary["category"];
const CATEGORIES = Object.entries(INQUIRY_CATEGORY) as Array<[Category, string]>;

export default function InquiriesPage() {
  const { user } = useSession();
  const [category, setCategory] = useState<Category | "">("");
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState<InquirySummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // 조건을 빨리 바꾸면 늦게 온 이전 응답이 새 목록을 덮어쓰므로, 마지막 요청의 응답만 쓴다
  const latest = useRef(0);
  const load = useCallback(
    (after?: string) => {
      const id = ++latest.current;
      const query = { ...(category && { category }), ...(mine && { mine: true }), ...(after && { cursor: after }) };
      return unwrap(api.GET("/inquiries", { params: { query } }))
        .then((page) => {
          if (id !== latest.current) return;
          setItems((prev) => (after ? [...prev, ...page.items] : page.items));
          setCursor(page.nextCursor);
        })
        .catch((err: Error) => setError(err.message));
    },
    [category, mine],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <p className="small">
        <Link href="/help">← 도움말</Link>
      </p>
      <div className="spread">
        <h1 style={{ margin: 0 }}>문의 게시판</h1>
        {user ? (
          !writing && <button onClick={() => setWriting(true)}>문의하기</button>
        ) : (
          <Link href="/login" className="button">
            로그인하고 문의하기
          </Link>
        )}
      </div>
      <p className="muted small">
        자주 묻는 질문에서 답을 찾지 못하셨으면 여기에 남겨 주세요. 운영자가 답변을 달면 상태가 &quot;답변 완료&quot;로 바뀝니다. 비밀 문의는 작성자와 운영자만 봅니다.
      </p>

      {writing && <InquiryForm onCancel={() => setWriting(false)} />}

      <div className="row">
        <label>
          분류
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">전체</option>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {user && (
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            <span>내 문의만</span>
          </label>
        )}
      </div>
      <ErrorText error={error} />

      {items.length === 0 ? (
        <p className="muted">아직 문의가 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label="문의 목록">
            <thead>
              <tr>
                <th>분류</th>
                <th>제목</th>
                <th>상태</th>
                <th>작성</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td className="small">{INQUIRY_CATEGORY[q.category]}</td>
                  <td>
                    {q.isPrivate && <span aria-label="비밀 문의">🔒 </span>}
                    {isReadable(q) ? <Link href={`/help/inquiries/${q.id}`}>{q.title}</Link> : <span className="muted">{q.title}</span>}
                    {q.replyCount > 0 && <span className="small muted"> · 답글 {q.replyCount}</span>}
                    {q.mine && <span className="badge"> 내 문의</span>}
                  </td>
                  <td>
                    <span className={q.status === "OPEN" ? "badge" : "badge muted"}>{INQUIRY_STATUS[q.status]}</span>
                  </td>
                  <td className="small">
                    {q.authorName ?? "-"}
                    <br />
                    <span className="muted">{dateTime(q.createdAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <div className="row">
          <button className="secondary" onClick={() => void load(cursor)}>
            더 보기
          </button>
        </div>
      )}
    </div>
  );
}

function InquiryForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ category: "ACCOUNT" as Category, title: "", body: "", isPrivate: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await unwrap(api.POST("/inquiries", { body: form }));
      router.push(`/help/inquiries/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="문의 쓰기">
      <h2 style={{ margin: 0 }}>문의 쓰기</h2>
      <label>
        분류
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        제목
        <input required maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        내용
        <textarea required maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        계좌번호·주민등록번호·비밀번호는 쓰지 마세요. 계약·정산 문의는 딜 화면 주소를 함께 적어 주시면 빨리 확인할 수 있습니다.
      </p>
      <label className="check">
        <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} />
        <span>비밀 문의 (작성자와 운영자만 봅니다. 끄면 다른 이용자도 질문과 답변을 볼 수 있습니다)</span>
      </label>
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy}>
          문의 올리기
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          취소
        </button>
      </div>
    </form>
  );
}
