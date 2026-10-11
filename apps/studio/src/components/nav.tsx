"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleBadges } from "@/components/ui";
import { DEV_ACCOUNTS_ENABLED } from "@/lib/dev-accounts";
import { useSession } from "@/lib/session";

export function Nav() {
  const { user, has, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const link = (href: string, label: string) => (
    <Link href={href} className={pathname.startsWith(href) ? "active" : undefined}>
      {label}
    </Link>
  );

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/scripts" className="nav-brand">
          🎬 대본매칭
        </Link>
        <nav className="nav-links">
          {link("/scripts", "대본 탐색")}
          {has("WRITER") && link("/dashboard", "제공자 대시보드")}
          {user && link("/negotiations", "협상")}
          {user && link("/deals", "내 딜")}
          {has("ADMIN") && link("/admin", "관리자")}
          {has("ADMIN") && link("/admin/logs", "활동 로그")}
          {user && link("/account", user.roles.length === 0 ? "권한 신청" : "내 계정")}
          {DEV_ACCOUNTS_ENABLED && link("/dev/accounts", "계정 전환(개발)")}
        </nav>
        {user ? (
          <div className="row small">
            <span className="muted">{user.displayName}</span>
            <RoleBadges roles={user.roles} />
            <button
              className="ghost"
              onClick={async () => {
                await logout();
                router.push("/scripts");
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="row">
            <Link href="/login" className="button secondary">
              로그인
            </Link>
            <Link href="/signup" className="button">
              가입
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
