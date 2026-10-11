"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, won, type Deal } from "@/lib/api";

export default function DealsPage() {
  return (
    <RequireAuth>
      <DealList />
    </RequireAuth>
  );
}

function DealList() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/deals"))
      .then(setDeals)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="stack">
      <h1>내 딜</h1>
      <ErrorText error={error} />
      {deals?.length === 0 && <p className="muted">아직 성사된 딜이 없습니다. 협상에서 제안이 수락되면 딜이 만들어집니다.</p>}
      <div className="grid">
        {deals?.map((d) => (
          <Link key={d.id} href={`/deals/${d.id}`} className="card stack" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="spread">
              <strong>{d.script.title}</strong>
              <StatusBadge status={d.status} />
            </div>
            <p className="small muted">
              작가 {d.writer.displayName} · 제작자 {d.producer.displayName}
            </p>
            <p className="small">
              작가 {d.acceptedOffer.writerSharePct}% / 제작자 {d.acceptedOffer.producerSharePct}% · 선급금 {won(d.acceptedOffer.upfrontFeeKrw)}
            </p>
            <p className="small muted">{dateTime(d.createdAt)} 성사</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
