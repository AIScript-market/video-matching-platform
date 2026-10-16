"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleBadges } from "@/components/ui";
import { DEV_ACCOUNTS_ENABLED } from "@/lib/dev-accounts";
import { useSession } from "@/lib/session";

type Feature = "talent" | "casting" | "hitModel";
interface Tab {
  href: string;
  label: string;
  /** 이 기능이 켜졌을 때만 */
  feature?: Feature;
}

/** 대본 탐색 안의 탭 (추천은 흥행 판단이 켜졌을 때만) */
const BROWSE_TABS: Tab[] = [
  { href: "/scripts", label: "전체 대본" },
  { href: "/recommendations", label: "추천 대본", feature: "hitModel" },
];

/** 마이페이지 안의 탭 */
const MY_TABS: Tab[] = [
  { href: "/dashboard", label: "내 대본" },
  { href: "/deals", label: "내 딜" },
  { href: "/contracts", label: "계약" },
  { href: "/earnings", label: "수익" },
  { href: "/talent", label: "출연자", feature: "talent" },
  { href: "/account", label: "내 계정" },
];

/** 관리자 안의 탭 */
const ADMIN_TABS: Tab[] = [
  { href: "/admin", label: "회원" },
  { href: "/admin/reports", label: "신고" },
  { href: "/admin/logs", label: "활동 로그" },
  { href: "/admin/videos", label: "영상 검수" },
  { href: "/admin/casting", label: "출연 관리", feature: "casting" },
  { href: "/admin/ml", label: "흥행 모델", feature: "hitModel" },
];

/** 경로가 이 탭에 속하는가 (/admin은 다른 관리자 탭과 겹치지 않게 정확히) */
const matches = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

export function Nav() {
  const { user, config, has, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = has("ADMIN");
  const on = (f?: Feature) => !f || Boolean(config?.features[f]);
  const visible = (tabs: Tab[]) => tabs.filter((t) => on(t.feature));

  const browseTabs = visible(BROWSE_TABS).filter((t) => t.href === "/scripts" || user);
  // 관리자는 창작 활동을 하지 않으므로 마이페이지 탭 대신 딜·계약·계정만
  const myTabs = visible(MY_TABS).filter((t) => !isAdmin || ["/deals", "/contracts", "/account"].includes(t.href));
  const adminTabs = visible(ADMIN_TABS);
  const inSection = (tabs: Tab[]) => tabs.some((t) => matches(pathname, t.href));

  // 지금 있는 묶음의 탭을 주 메뉴 아래 한 줄로 보여 준다
  let section: Tab[] | null = null;
  let sectionLabel = "";
  if (isAdmin && inSection(adminTabs)) [section, sectionLabel] = [adminTabs, "관리자 메뉴"];
  else if (user && inSection(myTabs)) [section, sectionLabel] = [myTabs, "마이페이지 메뉴"];
  else if (inSection(browseTabs) && browseTabs.length > 1) [section, sectionLabel] = [browseTabs, "대본 탐색 메뉴"];

  const top = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? "active" : undefined}>
      {label}
    </Link>
  );

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/scripts" className="nav-brand">
          🎬 대본매칭
        </Link>
        {config?.betaMode && <span className="badge">베타</span>}
        <nav className="nav-links" aria-label="주 메뉴">
          {top("/scripts", "대본 탐색", inSection(browseTabs))}
          {user && top("/negotiations", "협상", matches(pathname, "/negotiations"))}
          {user && !isAdmin && on("casting") && top("/casting", "캐스팅", matches(pathname, "/casting"))}
          {user && !isAdmin && top("/dashboard", "마이페이지", inSection(myTabs))}
          {isAdmin && top("/admin", "관리자", inSection(adminTabs))}
          {isAdmin && top("/account", "내 계정", inSection(myTabs))}
          {top("/help", "도움말", matches(pathname, "/help"))}
          {DEV_ACCOUNTS_ENABLED && top("/dev/accounts", "계정 전환(개발)", matches(pathname, "/dev"))}
        </nav>
        {user ? (
          <div className="row small">
            <span className="muted">{user.displayName}</span>
            <RoleBadges roles={user.roles} />
            {!isAdmin && (
              <Link href="/account#coins" className="badge" title="보유 코인" data-testid="coin-balance">
                🪙 {user.coinBalance}
              </Link>
            )}
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
      {section && (
        <nav className="nav-tabs" aria-label={sectionLabel}>
          <div className="nav-tabs-inner">
            {section.map((t) => (
              <Link key={t.href} href={t.href} className={matches(pathname, t.href) ? "active" : undefined}>
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
