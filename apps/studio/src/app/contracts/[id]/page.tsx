"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ContractPanel } from "@/components/contract-view";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, unwrap, type Contract } from "@/lib/api";

export default function ContractPage() {
  return (
    <RequireAuth>
      <ContractDetail />
    </RequireAuth>
  );
}

function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/contracts/{id}", { params: { path: { id } } }))
      .then(setContract)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (!contract) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;
  return (
    <div className="stack">
      <div className="row">
        <Link href="/contracts">← 계약 목록</Link>
        {contract.dealId && <Link href={`/deals/${contract.dealId}`}>딜 보기 →</Link>}
      </div>
      <ContractPanel contract={contract} onChange={setContract} />
    </div>
  );
}
