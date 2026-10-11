"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LedgerTable } from "@/components/ledger-table";
import { ErrorText, RequireAuth, RoleBadges, StatusBadge, UserStatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type Deal, type Ledger, type Schemas } from "@/lib/api";

type AdminUser = Schemas["AdminUserDto"];
type AdminScript = Schemas["AdminScriptDto"];
type LedgerType = Schemas["CreateLedgerEntryDto"]["type"];
type StatusFilter = "" | AdminUser["status"];

export default function AdminPage() {
  return (
    <RequireAuth role="ADMIN">
      <Admin />
    </RequireAuth>
  );
}

function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [scripts, setScripts] = useState<AdminScript[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(
    () =>
      unwrap(api.GET("/admin/users", { params: { query: { ...(statusFilter ? { status: statusFilter } : {}), ...(q ? { q } : {}) } } }))
        .then(setUsers)
        .catch((err: Error) => setError(err.message)),
    [statusFilter, q],
  );

  const loadRest = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/admin/scripts")), unwrap(api.GET("/deals"))])
        .then(([s, d]) => {
          setScripts(s);
          setDeals(d);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadRest();
  }, [loadRest]);

  async function setStatus(user: AdminUser, status: "ACTIVE" | "SUSPENDED") {
    setError(null);
    let reason: string | undefined;
    if (status === "SUSPENDED") {
      const input = window.prompt(`${user.displayName}(${user.email}) 계정을 정지합니다. 사유를 입력하세요.`, "");
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    try {
      await unwrap(
        api.PATCH("/admin/users/{id}/status", { params: { path: { id: user.id } }, body: { status, ...(reason ? { reason } : {}) } }),
      );
      await Promise.all([loadUsers(), loadRest()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function adjustCoins(user: AdminUser, amount: number) {
    setError(null);
    try {
      await unwrap(api.POST("/admin/users/{id}/coins", { params: { path: { id: user.id } }, body: { amount, memo: "관리자 지급" } }));
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleHidden(script: AdminScript) {
    try {
      await unwrap(
        api.PATCH("/admin/scripts/{id}/hide", {
          params: { path: { id: script.id } },
          body: { hidden: script.status !== "HIDDEN" },
        }),
      );
      await loadRest();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1>관리자</h1>
        <Link href="/admin/logs" className="button secondary">
          활동 로그 (메시지·열람·업로드·코인)
        </Link>
      </div>
      <ErrorText error={error} />

      <section className="card stack" aria-label="사용자 관리">
        <div className="spread">
          <h2 style={{ margin: 0 }}>사용자 ({users.length})</h2>
          <div className="row">
            <select aria-label="상태 필터" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ width: "auto" }}>
              <option value="">전체</option>
              <option value="ACTIVE">정상</option>
              <option value="SUSPENDED">정지</option>
              <option value="WITHDRAWN">탈퇴</option>
            </select>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(qInput.trim());
              }}
            >
              <input aria-label="사용자 검색" placeholder="이름·이메일" value={qInput} onChange={(e) => setQInput(e.target.value)} style={{ width: 180 }} />
              <button type="submit" className="secondary">
                검색
              </button>
            </form>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>사용자</th>
                <th>종류</th>
                <th>상태</th>
                <th>프로필</th>
                <th className="num">코인</th>
                <th className="num">대본</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.roles.includes("ADMIN");
                return (
                  <tr key={u.id}>
                    <td>
                      {u.displayName}
                      <div className="small muted">{u.email}</div>
                      <div className="small muted">{dateTime(u.createdAt)} 가입</div>
                    </td>
                    <td>
                      <RoleBadges roles={u.roles} />
                    </td>
                    <td>
                      <UserStatusBadge status={u.status} />
                      {u.suspendReason && <div className="small muted">사유: {u.suspendReason}</div>}
                    </td>
                    <td className="small">
                      {u.profilePublic && u.emailPublic ? "공개" : u.profilePublic ? "프로필만 공개" : "비공개"}
                      {u.profilePublic && (
                        <div>
                          <Link href={`/users/${u.id}`}>보기</Link>
                        </div>
                      )}
                    </td>
                    <td className="num">{u.coinBalance}</td>
                    <td className="num">{u.scriptCount}</td>
                    <td>
                      {!isAdmin && u.status !== "WITHDRAWN" && (
                        <div className="row">
                          {u.status === "SUSPENDED" ? (
                            <button className="secondary" onClick={() => setStatus(u, "ACTIVE")}>
                              정지 해제
                            </button>
                          ) : (
                            <button className="danger" onClick={() => setStatus(u, "SUSPENDED")}>
                              정지
                            </button>
                          )}
                          <button className="ghost" onClick={() => adjustCoins(u, 10)} title="10코인 지급">
                            +10코인
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          정지된 계정은 로그인과 모든 이용이 막히고, 그 사람의 대본은 공개 목록에서 빠집니다. 정지된 이메일로는 다시 가입할 수 없습니다. 관리자 계정은 정지할 수 없습니다.
        </p>
      </section>

      <section className="card stack">
        <h2>딜별 장부 기록</h2>
        <LedgerForm deals={deals} />
      </section>

      <section className="card stack">
        <h2>대본 관리</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>작가</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.authorName}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    <button className={s.status === "HIDDEN" ? "secondary" : "danger"} onClick={() => toggleHidden(s)}>
                      {s.status === "HIDDEN" ? "숨김 해제" : "숨기기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LedgerForm({ deals }: { deals: Deal[] }) {
  const [dealId, setDealId] = useState("");
  const [type, setType] = useState<LedgerType>("REVENUE");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = dealId || deals[0]?.id || "";

  const loadLedger = useCallback(
    (id: string) =>
      unwrap(api.GET("/deals/{id}/ledger", { params: { path: { id } } }))
        .then(setLedger)
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    if (selected) void loadLedger(selected);
  }, [selected, loadLedger]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(
        api.POST("/deals/{id}/ledger", {
          params: { path: { id: selected } },
          body: {
            type,
            amountKrw: amount,
            ...(memo.trim() ? { memo: memo.trim() } : {}),
            ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
          },
        }),
      );
      setAmount(0);
      setMemo("");
      await loadLedger(selected);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (deals.length === 0) return <p className="muted small">아직 딜이 없습니다.</p>;

  return (
    <div className="stack">
      <form className="stack" onSubmit={submit}>
        <label>
          딜
          <select value={selected} onChange={(e) => setDealId(e.target.value)}>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.script.title} — {d.writer.displayName} × {d.producer.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ alignItems: "stretch" }}>
          <label style={{ flex: "1 1 140px" }}>
            유형
            <select value={type} onChange={(e) => setType(e.target.value as LedgerType)}>
              <option value="REVENUE">수익</option>
              <option value="PAYOUT">지급</option>
              <option value="FEE">수수료</option>
              <option value="ADJUSTMENT">조정 (음수 가능)</option>
            </select>
          </label>
          <label style={{ flex: "1 1 160px" }}>
            금액 (원)
            <input type="number" step={1} value={amount} onChange={(e) => setAmount(Math.round(Number(e.target.value) || 0))} />
          </label>
          <label style={{ flex: "1 1 200px" }}>
            발생 시각 (비우면 지금)
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </label>
        </div>
        <label>
          메모
          <input maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <ErrorText error={error} />
        <button type="submit">기록</button>
      </form>
      {ledger && <LedgerTable ledger={ledger} />}
    </div>
  );
}
