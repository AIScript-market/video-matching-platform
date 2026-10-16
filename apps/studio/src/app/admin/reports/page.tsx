"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { REPORT_REASON_LABEL } from "@/components/report-button";
import { ErrorText, RequireAuth, UserStatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type Schemas } from "@/lib/api";

type ReportedUser = Schemas["ReportedUserDto"];
type Report = Schemas["AdminReportDto"];
type StatusFilter = "" | Report["status"];
type Tab = "accounts" | "reports";

const REPORT_STATUS: Record<Report["status"], [string, string]> = {
  OPEN: ["처리 전", "warn"],
  RESOLVED: ["조치함", "ok"],
  DISMISSED: ["기각", "plain"],
};

export default function AdminReportsPage() {
  return (
    <RequireAuth role="ADMIN">
      <Suspense fallback={<p className="muted">불러오는 중…</p>}>
        <Reports />
      </Suspense>
    </RequireAuth>
  );
}

function Reports() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("target") ? "reports" : "accounts");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    params.get("target") ? { id: params.get("target")!, name: params.get("name") ?? "선택한 계정" } : null,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [accounts, setAccounts] = useState<ReportedUser[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(
    () =>
      unwrap(api.GET("/admin/reported-users"))
        .then(setAccounts)
        .catch((err: Error) => setError(err.message)),
    [],
  );

  const loadReports = useCallback(
    (from?: string) =>
      unwrap(
        api.GET("/admin/reports", {
          params: {
            query: {
              ...(statusFilter ? { status: statusFilter } : {}),
              ...(target ? { targetId: target.id } : {}),
              ...(from ? { cursor: from } : {}),
            },
          },
        }),
      )
        .then((page) => {
          setReports((prev) => (from && prev ? [...prev, ...page.items] : page.items));
          setCursor(page.nextCursor);
        })
        .catch((err: Error) => setError(err.message)),
    [statusFilter, target],
  );

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function showReportsOf(user: ReportedUser["user"]) {
    setTarget({ id: user.id, name: user.displayName });
    setStatusFilter("OPEN");
    setTab("reports");
  }

  async function resolve(report: Report, status: "RESOLVED" | "DISMISSED", suspend = false) {
    const label = suspend ? "계정을 정지하고 처리" : status === "RESOLVED" ? "조치함으로 처리" : "기각";
    const note = window.prompt(`${report.target.displayName} 신고를 ${label}합니다. 처리 메모를 입력하세요.`, "");
    if (note === null) return;
    setError(null);
    try {
      await unwrap(
        api.PATCH("/admin/reports/{id}", {
          params: { path: { id: report.id } },
          body: { status, ...(note.trim() ? { note: note.trim() } : {}), ...(suspend ? { suspend: true } : {}) },
        }),
      );
      await Promise.all([loadReports(), loadAccounts()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const openTotal = accounts?.reduce((sum, a) => sum + a.openCount, 0) ?? 0;

  return (
    <div className="stack">
      <div className="spread">
        <h1>신고 관리</h1>
        <Link href="/admin" className="button secondary">
          관리자 홈
        </Link>
      </div>
      <div className="chips" role="tablist" aria-label="신고 보기">
        <button role="tab" aria-selected={tab === "accounts"} className={`chip${tab === "accounts" ? " on" : ""}`} onClick={() => setTab("accounts")}>
          신고된 계정 {accounts && accounts.length > 0 && `(${accounts.length})`}
        </button>
        <button role="tab" aria-selected={tab === "reports"} className={`chip${tab === "reports" ? " on" : ""}`} onClick={() => setTab("reports")}>
          신고 목록 {openTotal > 0 && `· 처리 전 ${openTotal}`}
        </button>
      </div>
      <ErrorText error={error} />

      {tab === "accounts" && (
        <section className="card stack" role="tabpanel" aria-label="신고된 계정">
          <p className="small muted">처리 전 신고가 있는 계정입니다. 처리 전 신고가 많은 순, 같으면 신고한 사람이 많은 순입니다.</p>
          {accounts === null ? (
            <p className="muted">불러오는 중…</p>
          ) : accounts.length === 0 ? (
            <p className="muted small">처리할 신고가 없습니다.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>계정</th>
                    <th>상태</th>
                    <th className="num">처리 전</th>
                    <th className="num">신고한 사람</th>
                    <th className="num">누적</th>
                    <th>주요 사유</th>
                    <th>마지막 신고</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.user.id}>
                      <td>
                        <Link href={`/users/${a.user.id}`}>{a.user.displayName}</Link>
                        <div className="small muted">{a.user.email}</div>
                      </td>
                      <td>
                        <UserStatusBadge status={a.user.status} />
                      </td>
                      <td className="num">
                        <strong>{a.openCount}</strong>
                      </td>
                      <td className="num">{a.openReporters}</td>
                      <td className="num">{a.totalCount}</td>
                      <td className="small">{a.reasons.map((r) => REPORT_REASON_LABEL[r]).join(", ")}</td>
                      <td className="small">{dateTime(a.lastReportedAt)}</td>
                      <td>
                        <button className="secondary" onClick={() => showReportsOf(a.user)}>
                          신고 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "reports" && (
        <section className="card stack" role="tabpanel" aria-label="신고 목록">
          <div className="spread">
            <div className="row">
              <select aria-label="처리 상태" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ width: "auto" }}>
                <option value="OPEN">처리 전</option>
                <option value="RESOLVED">조치함</option>
                <option value="DISMISSED">기각</option>
                <option value="">전체</option>
              </select>
              {target && (
                <span className="badge">
                  {target.name}{" "}
                  <button type="button" className="ghost" style={{ padding: "0 6px" }} onClick={() => setTarget(null)} aria-label="계정 필터 해제">
                    ✕
                  </button>
                </span>
              )}
            </div>
          </div>
          {reports === null ? (
            <p className="muted">불러오는 중…</p>
          ) : reports.length === 0 ? (
            <p className="muted small">신고가 없습니다.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>접수</th>
                    <th>신고된 계정</th>
                    <th>신고자</th>
                    <th>사유·내용</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const [label, tone] = REPORT_STATUS[r.status];
                    return (
                      <tr key={r.id}>
                        <td className="small">{dateTime(r.createdAt)}</td>
                        <td>
                          {r.target.displayName} <UserStatusBadge status={r.target.status} />
                          <div className="small muted">{r.target.email}</div>
                        </td>
                        <td>
                          {r.reporter.displayName}
                          <div className="small muted">{r.reporter.email}</div>
                        </td>
                        <td style={{ maxWidth: 320 }}>
                          <strong>{REPORT_REASON_LABEL[r.reason]}</strong>
                          {r.details && <div className="small pre">{r.details}</div>}
                          {r.script && (
                            <div className="small">
                              대본: <Link href={`/scripts/${r.script.id}`}>{r.script.title}</Link>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${tone}`}>{label}</span>
                          {r.status !== "OPEN" && (
                            <div className="small muted">
                              {r.resolvedBy?.displayName} · {r.resolvedAt && dateTime(r.resolvedAt)}
                              {r.resolutionNote && <div>{r.resolutionNote}</div>}
                            </div>
                          )}
                        </td>
                        <td>
                          {r.status === "OPEN" && (
                            <div className="row">
                              <button className="secondary" onClick={() => resolve(r, "RESOLVED")}>
                                처리
                              </button>
                              <button className="ghost" onClick={() => resolve(r, "DISMISSED")}>
                                기각
                              </button>
                              {r.target.status === "ACTIVE" && (
                                <button className="danger" onClick={() => resolve(r, "RESOLVED", true)}>
                                  정지하고 처리
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {cursor && (
            <button className="secondary" onClick={() => loadReports(cursor)}>
              더 보기
            </button>
          )}
        </section>
      )}
    </div>
  );
}
