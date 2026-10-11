"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth, RoleBadges, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type Schemas } from "@/lib/api";

type Tab = "messages" | "views" | "uploads";
type MessageLog = Schemas["MessageLogDto"];
type ViewLog = Schemas["ViewLogDto"];
type UploadLog = Schemas["UploadLogDto"];
type LogUser = Schemas["LogUserDto"];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "messages", label: "메시지" },
  { id: "views", label: "전문 열람" },
  { id: "uploads", label: "대본 업로드" },
];

export default function AdminLogsPage() {
  return (
    <RequireAuth role="ADMIN">
      <Logs />
    </RequireAuth>
  );
}

function fetchPage(tab: Tab, q: string, cursor?: string) {
  const query = { ...(q ? { q } : {}), ...(cursor ? { cursor } : {}), take: 50 };
  if (tab === "messages") return unwrap(api.GET("/admin/logs/messages", { params: { query } }));
  if (tab === "views") return unwrap(api.GET("/admin/logs/views", { params: { query } }));
  return unwrap(api.GET("/admin/logs/uploads", { params: { query } }));
}

function Logs() {
  const [tab, setTab] = useState<Tab>("messages");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<MessageLog | ViewLog | UploadLog> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (from?: string) =>
      fetchPage(tab, q, from)
        .then((page) => {
          setItems((prev) => (from && prev ? [...prev, ...page.items] : page.items));
          setCursor(page.nextCursor);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [tab, q],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <div className="spread">
        <h1>활동 로그</h1>
        <Link href="/admin" className="button secondary">
          관리자 홈
        </Link>
      </div>
      <p className="small muted">제작자와 대본 제공자 사이의 메시지, 대본 전문 열람, 대본 파일 업로드 기록입니다. 최신순.</p>

      <div className="spread">
        <div className="chips" role="tablist" aria-label="로그 종류">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`chip${tab === t.id ? " on" : ""}`}
              onClick={() => {
                setItems(null);
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
          }}
        >
          <input placeholder="대본 제목, 이름, 이메일" aria-label="로그 검색" value={input} onChange={(e) => setInput(e.target.value)} style={{ width: 220 }} />
          <button type="submit" className="secondary">
            검색
          </button>
        </form>
      </div>

      <ErrorText error={error} />
      <section className="card stack" role="tabpanel">
        {items === null ? (
          <p className="muted">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="muted small">기록이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            {tab === "messages" && <MessageTable rows={items as MessageLog[]} />}
            {tab === "views" && <ViewTable rows={items as ViewLog[]} />}
            {tab === "uploads" && <UploadTable rows={items as UploadLog[]} />}
          </div>
        )}
        {cursor && (
          <button className="secondary" onClick={() => load(cursor)}>
            더 보기
          </button>
        )}
      </section>
    </div>
  );
}

function Who({ user }: { user: LogUser }) {
  return (
    <div>
      {user.displayName} <RoleBadges roles={user.roles} />
      <div className="small muted">{user.email}</div>
    </div>
  );
}

function MessageTable({ rows }: { rows: MessageLog[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>대본</th>
          <th>보낸 사람</th>
          <th>받는 사람</th>
          <th>내용</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="small">{dateTime(m.createdAt)}</td>
            <td>
              {m.script.title}
              <div>
                <StatusBadge status={m.negotiationStatus} />
              </div>
            </td>
            <td>
              <Who user={m.sender} />
            </td>
            <td>
              <Who user={m.recipient} />
            </td>
            <td className="pre small" style={{ maxWidth: 360 }}>
              {m.body}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ViewTable({ rows }: { rows: ViewLog[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>대본</th>
          <th>열람한 사람</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.id}>
            <td className="small">{dateTime(v.viewedAt)}</td>
            <td>{v.script.title}</td>
            <td>
              <Who user={v.user} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UploadTable({ rows }: { rows: UploadLog[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>대본</th>
          <th>올린 사람</th>
          <th>파일</th>
          <th className="num">크기</th>
          <th className="num">본문 글자 수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="small">{dateTime(u.createdAt)}</td>
            <td>{u.script.title}</td>
            <td>
              <Who user={u.uploader} />
            </td>
            <td className="small">{u.filename}</td>
            <td className="num small">{(u.sizeBytes / 1024).toFixed(1)}KB</td>
            <td className="num small">{u.charCount.toLocaleString("ko-KR")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
