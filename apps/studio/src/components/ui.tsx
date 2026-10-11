"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import type { Role } from "@/lib/api";

const STATUS_LABEL: Record<string, [string, string]> = {
  DRAFT: ["작성 중", "plain"],
  PUBLISHED: ["공개", "ok"],
  HIDDEN: ["숨김", "bad"],
  PENDING: ["대기", "warn"],
  APPROVED: ["승인", "ok"],
  REJECTED: ["거절", "bad"],
  OPEN: ["협상 중", "warn"],
  AGREED: ["합의", "ok"],
  CLOSED: ["종료", "plain"],
  PROPOSED: ["제안됨", "warn"],
  COUNTERED: ["역제안됨", "plain"],
  ACCEPTED: ["수락", "ok"],
  WITHDRAWN: ["철회", "plain"],
  PENDING_CONTRACT: ["계약 대기", "warn"],
  ACTIVE: ["진행 중", "ok"],
  TERMINATED: ["종료", "plain"],
  SUSPENDED: ["중지", "bad"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS_LABEL[status] ?? [status, "plain"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export const ROLE_LABEL: Record<Role, string> = {
  WRITER: "작가",
  PRODUCER: "제작자",
  ADMIN: "관리자",
};

/** 로그인(과 역할)이 필요한 화면을 감싼다 */
export function RequireAuth({ role, children }: { role?: Role; children: React.ReactNode }) {
  const { user, loading, has } = useSession();
  if (loading) return <p className="muted">불러오는 중…</p>;
  if (!user)
    return (
      <div className="card stack">
        <p>로그인이 필요합니다.</p>
        <div className="row">
          <Link href="/login" className="button">
            로그인
          </Link>
          <Link href="/signup" className="button secondary">
            가입
          </Link>
        </div>
      </div>
    );
  if (role && !has(role)) return <p className="error">{ROLE_LABEL[role]} 역할이 필요합니다.</p>;
  return <>{children}</>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
