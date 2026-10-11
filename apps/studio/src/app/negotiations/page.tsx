"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, unwrap, type Negotiation } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function NegotiationsPage() {
  return (
    <RequireAuth>
      <NegotiationList />
    </RequireAuth>
  );
}

function NegotiationList() {
  const { user } = useSession();
  const [items, setItems] = useState<Negotiation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/negotiations"))
      .then(setItems)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="stack">
      <h1>협상</h1>
      <ErrorText error={error} />
      {items?.length === 0 && (
        <p className="muted">
          진행 중인 협상이 없습니다. 제작자는 열람 승인을 받은 대본에서 협상을 시작할 수 있습니다.
        </p>
      )}
      <div className="stack">
        {items?.map((n) => {
          const counterpart = n.writerId === user?.id ? n.producer : n.writer;
          const offer = n.latestOffer;
          return (
            <Link key={n.id} href={`/negotiations/${n.id}`} className="card spread" style={{ color: "inherit", textDecoration: "none" }}>
              <div>
                <strong>{n.script.title}</strong>
                <div className="small muted">
                  {n.writerId === user?.id ? "제작자" : "작가"} {counterpart.displayName}
                </div>
              </div>
              <div className="row">
                {offer && (
                  <span className="small muted">
                    최근 제안 <StatusBadge status={offer.status} />
                  </span>
                )}
                <StatusBadge status={n.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
