"use client";

import { notFound, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { DEV_ACCOUNTS, DEV_ACCOUNTS_ENABLED } from "@/lib/dev-accounts";
import { useSession } from "@/lib/session";

export default function DevLoginPage() {
  if (!DEV_ACCOUNTS_ENABLED) notFound();
  return (
    <Suspense fallback={<p className="muted">로그인 중…</p>}>
      <DevLogin />
    </Suspense>
  );
}

/** /dev/login?as=<계정키> : 시드 계정으로 자동 로그인 후 그 역할의 첫 화면으로 이동 */
function DevLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const account = DEV_ACCOUNTS.find((a) => a.key === params.get("as"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    unwrap(api.POST("/auth/login", { body: { email: account.email, password: account.password } }))
      .then(() => refresh())
      .then(() => router.replace(account.landing))
      .catch((err: Error) => setError(err.message));
  }, [account, refresh, router]);

  if (!account) return <p className="error">알 수 없는 계정입니다.</p>;
  return error ? <p className="error">{error}</p> : <p className="muted">{account.label}({account.role})으로 로그인 중…</p>;
}
