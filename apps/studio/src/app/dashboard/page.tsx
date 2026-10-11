"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type AccessRequest, type Negotiation, type ScriptSummary } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  return (
    <RequireAuth role="WRITER">
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { user } = useSession();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        unwrap(api.GET("/scripts", { params: { query: { mine: true, take: 50 } } })),
        unwrap(api.GET("/access-requests", { params: { query: { as: "writer" } } })),
        unwrap(api.GET("/negotiations")),
      ])
        .then(([mine, reqs, negs]) => {
          setScripts(mine.items);
          setRequests(reqs);
          setNegotiations(negs.filter((n) => n.writerId === user?.id));
        })
        .catch((err: Error) => setError(err.message)),
    [user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    try {
      if (action === "approve") await unwrap(api.POST("/access-requests/{id}/approve", { params: { path: { id } } }));
      else await unwrap(api.POST("/access-requests/{id}/reject", { params: { path: { id } } }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const waitingOffers = negotiations.filter((n) => n.latestOffer?.status === "PROPOSED" && n.latestOffer.proposerId !== user?.id);

  return (
    <div className="stack">
      <div className="spread">
        <h1>대본 제공자 대시보드</h1>
        <Link href="/dashboard/scripts/new" className="button">
          + 새 대본
        </Link>
      </div>
      <ErrorText error={error} />

      <section className="card stack">
        <h2>받은 제안 {waitingOffers.length > 0 && <span className="badge warn">{waitingOffers.length}</span>}</h2>
        {waitingOffers.length === 0 ? (
          <p className="muted small">응답을 기다리는 제안이 없습니다.</p>
        ) : (
          waitingOffers.map((n) => (
            <div key={n.id} className="spread">
              <div>
                <strong>{n.script.title}</strong> · {n.producer.displayName}
                <div className="small muted">
                  작가 {n.latestOffer!.writerSharePct}% / 제작자 {n.latestOffer!.producerSharePct}% · 선급금{" "}
                  {n.latestOffer!.upfrontFeeKrw.toLocaleString("ko-KR")}원 · {n.latestOffer!.termMonths}개월
                  {n.latestOffer!.exclusive ? " · 독점" : ""}
                </div>
              </div>
              <Link href={`/negotiations/${n.id}`} className="button secondary">
                협상방에서 응답
              </Link>
            </div>
          ))
        )}
      </section>

      <section className="card stack">
        <h2>받은 열람 요청 {pending.length > 0 && <span className="badge warn">{pending.length}</span>}</h2>
        {requests.length === 0 ? (
          <p className="muted small">아직 열람 요청이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>대본</th>
                  <th>제작자</th>
                  <th>NDA 동의</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.script.title}</td>
                    <td>{r.producer.displayName}</td>
                    <td className="small">{dateTime(r.ndaAcceptedAt)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      {r.status === "PENDING" && (
                        <div className="row">
                          <button onClick={() => decide(r.id, "approve")}>승인</button>
                          <button className="ghost" onClick={() => decide(r.id, "reject")}>
                            거절
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>내 대본</h2>
        {scripts.length === 0 ? (
          <p className="muted small">아직 대본이 없습니다. 새 대본을 작성해 보세요.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>장르</th>
                  <th>상태</th>
                  <th>수정</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scripts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/scripts/${s.id}`}>{s.title}</Link>
                    </td>
                    <td>{s.genre}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="small">{dateTime(s.updatedAt)}</td>
                    <td>
                      <Link href={`/dashboard/scripts/${s.id}`}>편집</Link>
                    </td>
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
