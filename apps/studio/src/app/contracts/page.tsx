"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTRACT_KIND_LABEL, ContractStatus } from "@/components/contract-view";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap, type ContractSummary } from "@/lib/api";

export default function ContractsPage() {
  return (
    <RequireAuth>
      <ContractList />
    </RequireAuth>
  );
}

function ContractList() {
  const [rows, setRows] = useState<ContractSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/contracts")).then(setRows).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="stack">
      <h1>계약</h1>
      <p className="muted small">
        플랫폼에서 맺은 계약입니다. 지금은 <strong>베타 계약서 v0</strong>(법률 검토 전 초안)를 씁니다. 정식 계약서가 나오면 새 버전으로 다시 서명을 요청할 수 있습니다.
      </p>
      <ErrorText error={error} />
      {rows && rows.length === 0 && <p className="muted">아직 계약이 없습니다.</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>종류</th>
                <th>제목</th>
                <th>상태</th>
                <th>만든 날</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{CONTRACT_KIND_LABEL[c.kind]}</td>
                  <td>
                    <Link href={`/contracts/${c.id}`}>{c.title}</Link>
                    {c.awaitingMySignature && <span className="badge warn" style={{ marginLeft: 6 }}>내 서명 필요</span>}
                  </td>
                  <td>
                    <ContractStatus status={c.status} />
                  </td>
                  <td className="small">{dateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
