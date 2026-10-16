"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap } from "@/lib/api";
import { INQUIRY_CATEGORY, INQUIRY_STATUS, type InquirySummary } from "@/lib/inquiries";

type Status = InquirySummary["status"];
const TABS: Array<[Status | "", string]> = [
  ["OPEN", "답변 대기"],
  ["ANSWERED", "답변 완료"],
  ["CLOSED", "해결됨"],
  ["", "전체"],
];

export default function AdminInquiriesPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminInquiries />
    </RequireAuth>
  );
}

function AdminInquiries() {
  const [tab, setTab] = useState<Status | "">("OPEN");
  const [items, setItems] = useState<InquirySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef(0);
  const load = useCallback(() => {
    const id = ++latest.current;
    return unwrap(api.GET("/inquiries", { params: { query: { take: 50, ...(tab && { status: tab }) } } }))
      .then((page) => {
        if (id === latest.current) setItems(page.items);
      })
      .catch((err: Error) => setError(err.message));
  }, [tab]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <h1>문의</h1>
      <p className="small muted">문의 게시판의 글입니다. 답변 대기는 오래 기다린 문의부터 보입니다. 운영자 답변은 이용자에게 &quot;운영자&quot;로 보입니다.</p>
      <div className="row">
        {TABS.map(([s, label]) => (
          <button key={label} className={s === tab ? undefined : "secondary"} onClick={() => setTab(s)}>
            {label}
          </button>
        ))}
      </div>
      <ErrorText error={error} />
      {items.length === 0 ? (
        <p className="muted">해당하는 문의가 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label="관리자 문의 목록">
            <thead>
              <tr>
                <th>분류</th>
                <th>제목</th>
                <th>상태</th>
                <th>작성자</th>
                <th>마지막 글</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td className="small">{INQUIRY_CATEGORY[q.category]}</td>
                  <td>
                    {q.isPrivate && <span aria-label="비밀 문의">🔒 </span>}
                    <Link href={`/help/inquiries/${q.id}`}>{q.title}</Link>
                    {q.hidden && <span className="badge muted"> 숨김</span>}
                  </td>
                  <td className="small">{INQUIRY_STATUS[q.status]}</td>
                  <td className="small">{q.authorName}</td>
                  <td className="small">{dateTime(q.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
