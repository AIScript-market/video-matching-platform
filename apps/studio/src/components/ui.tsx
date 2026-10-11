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
  WRITER: "일반",
  PRODUCER: "일반",
  ADMIN: "관리자",
};

/** 계정 종류 배지: 관리자 / 일반 */
export function RoleBadges({ roles }: { roles: Role[] }) {
  return roles.includes("ADMIN") ? <span className="badge bad">관리자</span> : <span className="badge plain">일반</span>;
}

/** 계정 상태 배지 */
export function UserStatusBadge({ status }: { status: string }) {
  if (status === "SUSPENDED") return <span className="badge bad">정지</span>;
  if (status === "WITHDRAWN") return <span className="badge plain">탈퇴</span>;
  return <span className="badge ok">정상</span>;
}

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
  if (role && !has(role))
    return (
      <div className="card stack">
        <p>
          이 화면은 <strong>{ROLE_LABEL[role]}</strong> 계정만 쓸 수 있습니다.
        </p>
      </div>
    );
  return <>{children}</>;
}

/** 대본 제공·영상 제작 화면: 로그인 + 프로필·이메일 공개가 필요하다 */
export function RequireCreator({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return (
    <RequireAuth>
      {user && !user.creatorReady ? <CreatorNotice /> : children}
    </RequireAuth>
  );
}

export function CreatorNotice() {
  const { user } = useSession();
  if (user?.roles.includes("ADMIN")) return <p className="muted">관리자 계정은 대본 제공·영상 제작을 하지 않습니다.</p>;
  return (
    <div className="card stack">
      <p>
        대본 제공과 영상 제작을 하려면 <strong>프로필 소개를 쓰고, 프로필과 이메일을 공개</strong>해야 합니다. 상대방이 누구와 거래하는지 알 수 있게 하기 위해서입니다.
      </p>
      <div className="row">
        <Link href="/account#profile" className="button">
          프로필 공개하러 가기
        </Link>
      </div>
    </div>
  );
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

/** 오류 문장. 코인 부족·프로필 미공개면 해결할 곳으로 가는 링크를 함께 보여준다 */
export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  const link = error.includes("코인이 부족")
    ? { href: "/account#coins", label: "코인 충전하기" }
    : error.includes("프로필") && error.includes("공개")
      ? { href: "/account#profile", label: "프로필 공개하기" }
      : null;
  return (
    <p className="error" role="alert">
      {error}
      {link && (
        <>
          {" "}
          <Link href={link.href}>{link.label} →</Link>
        </>
      )}
    </p>
  );
}
