"use client";

import { useCallback, useEffect, useState } from "react";
import { LedgerTable } from "@/components/ledger-table";
import { ErrorText, RequireAuth, ROLE_LABEL, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type Deal, type Ledger, type Schemas } from "@/lib/api";

type AdminUser = Schemas["AdminUserDto"];
type AdminScript = Schemas["AdminScriptDto"];
type LedgerType = Schemas["CreateLedgerEntryDto"]["type"];

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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/admin/users")), unwrap(api.GET("/admin/scripts")), unwrap(api.GET("/deals"))])
        .then(([u, s, d]) => {
          setUsers(u);
          setScripts(s);
          setDeals(d);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleHidden(script: AdminScript) {
    try {
      await unwrap(
        api.PATCH("/admin/scripts/{id}/hide", {
          params: { path: { id: script.id } },
          body: { hidden: script.status !== "HIDDEN" },
        }),
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <h1>관리자</h1>
      <ErrorText error={error} />

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

      <section className="card stack">
        <h2>사용자 ({users.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th className="num">대본</th>
                <th>가입</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td className="small">{u.email}</td>
                  <td className="small">{u.roles.map((r) => ROLE_LABEL[r]).join(", ")}</td>
                  <td className="num">{u.scriptCount}</td>
                  <td className="small">{dateTime(u.createdAt)}</td>
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
