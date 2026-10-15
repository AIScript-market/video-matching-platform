"use client";

import { useState } from "react";
import { ErrorText, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type Contract } from "@/lib/api";
import { useSession } from "@/lib/session";

export const CONTRACT_KIND_LABEL: Record<Contract["kind"], string> = {
  NDA: "비밀유지 서약서",
  SCRIPT_LICENSE: "대본 이용허락",
  CHANNEL_PUBLISHING: "채널 게시",
};

const ROLE_LABEL: Record<Contract["parties"][number]["role"], string> = {
  WRITER: "작가",
  PRODUCER: "제작자",
  PLATFORM: "플랫폼",
};

/** 계약서 본문 (템플릿이 쓰는 마크다운 일부: #, ##, - 만) */
export function ContractBody({ body }: { body: string }) {
  return (
    <div className="contract-body stack">
      {body.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
        if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith("- ")) return <p key={i} className="small">• {line.slice(2)}</p>;
        if (!line.trim()) return null;
        return <p key={i} className="small">{line}</p>;
      })}
    </div>
  );
}

export function ContractParties({ contract }: { contract: Contract }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>당사자</th>
            <th>이름</th>
            <th>서명</th>
          </tr>
        </thead>
        <tbody>
          {contract.parties.map((p) => (
            <tr key={p.role}>
              <td>{ROLE_LABEL[p.role]}</td>
              <td>{p.legalName}</td>
              <td className="small">{p.signedAt ? `${p.signedName} · ${dateTime(p.signedAt)}` : <span className="badge warn">서명 대기</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 계약서 전체: 상태, 본문, 당사자, (내 차례면) 서명 양식 */
export function ContractPanel({ contract, onChange }: { contract: Contract; onChange: (c: Contract) => void }) {
  return (
    <section className="card stack" aria-label="계약서">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{CONTRACT_KIND_LABEL[contract.kind]}</h2>
        <ContractStatus status={contract.status} />
      </div>
      <p className="small muted">
        {contract.templateVersion} · 본문 SHA-256 <code>{contract.bodySha256.slice(0, 16)}…</code>
        {contract.voidReason && ` · 무효 사유: ${contract.voidReason}`}
      </p>
      <ContractBody body={contract.body} />
      <ContractParties contract={contract} />
      {contract.awaitingMySignature && <SignForm contract={contract} onSigned={onChange} />}
    </section>
  );
}

export function ContractStatus({ status }: { status: Contract["status"] }) {
  if (status === "SIGNED") return <span className="badge ok">서명 완료</span>;
  if (status === "VOID") return <span className="badge bad">무효</span>;
  return <StatusBadge status="PENDING" />;
}

function SignForm({ contract, onSigned }: { contract: Contract; onSigned: (c: Contract) => void }) {
  const { user } = useSession();
  const legalName = contract.parties.find((p) => p.userId === user?.id && !p.signedAt)?.legalName ?? "";
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSigned(await unwrap(api.POST("/contracts/{id}/sign", { params: { path: { id: contract.id } }, body: { signedName: name, agreed: true } })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={sign} aria-label="전자서명">
      <h3>전자서명</h3>
      <label>
        계약서에 적힌 이름을 그대로 입력하세요 <span className="muted small">({legalName})</span>
        <input id="signed-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="check">
        <input id="sign-agreed" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{contract.signConsent}</span>
      </label>
      <p className="small muted">서명하면 서명 시각과 접속 정보(IP, 브라우저)가 계약 기록으로 남습니다.</p>
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy || !agreed || name.trim() !== legalName.trim()}>
          서명하기
        </button>
      </div>
    </form>
  );
}
