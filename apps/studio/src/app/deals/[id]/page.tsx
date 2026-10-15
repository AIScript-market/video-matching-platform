"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DealContract, DealSettlement, DealVideos } from "@/components/deal-channel";
import { DealProjectCard } from "@/components/deal-project-card";
import { LedgerTable } from "@/components/ledger-table";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, won, type Deal, type Ledger } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function DealPage() {
  return (
    <RequireAuth>
      <DealDetail />
    </RequireAuth>
  );
}

function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { config } = useSession();

  useEffect(() => {
    Promise.all([
      unwrap(api.GET("/deals/{id}", { params: { path: { id } } })),
      unwrap(api.GET("/deals/{id}/ledger", { params: { path: { id } } })),
    ])
      .then(([d, l]) => {
        setDeal(d);
        setLedger(l);
      })
      .catch((err: Error) => setError(err.message));
  }, [id, version]);

  if (!deal) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;
  const o = deal.acceptedOffer;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{deal.script.title}</h1>
          <p className="muted small">
            작가 {deal.writer.displayName} · 제작자 {deal.producer.displayName} · {dateTime(deal.createdAt)} 성사
          </p>
        </div>
        <div className="row">
          <span className="small muted">딜</span>
          <StatusBadge status={deal.status} />
          <Link href={`/negotiations/${deal.negotiationId}`} className="button secondary">
            협상방
          </Link>
        </div>
      </div>

      <div className="two-col">
        <section className="card stack">
          <h2>합의 조건</h2>
          <p>
            작가 {o.writerSharePct}% / 제작자 {o.producerSharePct}% · 선급금 {won(o.upfrontFeeKrw)} · {o.termMonths}개월 ·{" "}
            {o.exclusive ? "독점" : "비독점"}
          </p>
          {o.notes && <p className="small pre">비고: {o.notes}</p>}
        </section>
        <section className="card stack">
          <h2>라이선스</h2>
          {deal.licenses.map((l) => (
            <div key={l.id} className="stack">
              <StatusBadge status={l.status} />
              <p className="small pre">{l.scope}</p>
            </div>
          ))}
        </section>
      </div>

      <DealContract dealId={deal.id} onSigned={() => setVersion((v) => v + 1)} />
      <DealVideos key={`videos-${deal.status}`} deal={deal} />
      <DealSettlement dealId={deal.id} />

      {config?.features.casting && <DealProjectCard dealId={deal.id} />}

      <section className="card stack">
        <h2>장부</h2>
        {ledger && <LedgerTable ledger={ledger} />}
      </section>
    </div>
  );
}
