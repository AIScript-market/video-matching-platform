"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth, ROLE_LABEL, RoleBadges, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type RequestableRole, type RoleRequest } from "@/lib/api";
import { useSession } from "@/lib/session";

const REQUESTABLE: Array<{ role: RequestableRole; desc: string }> = [
  { role: "WRITER", desc: "대본을 올리고 공개하며, 제작자의 열람 요청과 제안을 받습니다." },
  { role: "PRODUCER", desc: "NDA 동의 후 대본 전문을 열람하고 작가에게 제작을 제안합니다." },
];

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}

function Account() {
  const { user, refresh } = useSession();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/role-requests/mine")), refresh()])
        .then(([reqs]) => setRequests(reqs))
        .catch((err: Error) => setError(err.message)),
    [refresh],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(role: RequestableRole) {
    setError(null);
    setNotice(null);
    try {
      await unwrap(api.POST("/role-requests", { body: { role, ...(message.trim() ? { message: message.trim() } : {}) } }));
      setMessage("");
      setNotice(`${ROLE_LABEL[role]} 권한을 신청했습니다. 관리자가 승인하면 바로 사용할 수 있습니다.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!user) return null;
  const pendingRoles = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.role));

  return (
    <div className="stack">
      <h1>내 계정</h1>

      <section className="card stack">
        <div className="spread">
          <div>
            <strong>{user.displayName}</strong> <span className="muted small">{user.email}</span>
          </div>
          <div className="row">
            <RoleBadges roles={user.roles} />
          </div>
        </div>
        {user.roles.length === 0 && (
          <p className="notice small">
            지금은 <strong>일반 계정</strong>입니다. 공개 대본을 둘러볼 수 있고, 대본을 올리거나 제작을 제안하려면 아래에서 권한을 신청하세요.
          </p>
        )}
        <div className="row small">
          {user.roles.includes("WRITER") && <Link href="/dashboard">제공자 대시보드로 →</Link>}
          {user.roles.includes("PRODUCER") && <Link href="/scripts">대본 탐색하고 열람 요청하기 →</Link>}
          {user.roles.includes("ADMIN") && <Link href="/admin">관리자 화면으로 →</Link>}
        </div>
      </section>

      <section className="card stack" aria-label="권한 신청">
        <h2>권한 신청</h2>
        <label>
          관리자에게 남길 말 (선택)
          <input maxLength={500} placeholder="경력, 포트폴리오 링크 등" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="grid">
          {REQUESTABLE.map(({ role, desc }) => {
            const has = user.roles.includes(role);
            const pending = pendingRoles.has(role);
            return (
              <div key={role} className="card stack">
                <h3>{ROLE_LABEL[role]}</h3>
                <p className="small muted">{desc}</p>
                {has ? (
                  <span className="badge ok">보유 중</span>
                ) : pending ? (
                  <span className="badge warn">승인 대기 중</span>
                ) : (
                  <button onClick={() => apply(role)}>{ROLE_LABEL[role]} 권한 신청</button>
                )}
              </div>
            );
          })}
        </div>
        <ErrorText error={error} />
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="card stack">
        <div className="spread">
          <h2>신청 내역</h2>
          <button className="ghost" onClick={() => load()}>
            새로고침
          </button>
        </div>
        {requests.length === 0 ? (
          <p className="muted small">신청 내역이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>권한</th>
                  <th>신청일</th>
                  <th>상태</th>
                  <th>처리일</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{ROLE_LABEL[r.role]}</td>
                    <td className="small">{dateTime(r.createdAt)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="small">{r.decidedAt ? dateTime(r.decidedAt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
