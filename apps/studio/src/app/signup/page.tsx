"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(api.POST("/auth/signup", { body: form }));
      await refresh();
      router.push("/account");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ maxWidth: 460, margin: "24px auto" }} onSubmit={submit}>
      <h1>가입</h1>
      <p className="small muted">
        가입하면 <strong>일반 계정</strong>이 만들어지고 <strong>10코인</strong>을 드립니다. 대본 제공·영상 제작은 가입 후 내 계정에서 프로필과 이메일을 공개하면 바로 할 수 있습니다.
      </p>
      <label>
        이름(활동명)
        <input required maxLength={40} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </label>
      <label>
        이메일
        <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </label>
      <label>
        비밀번호 (8자 이상)
        <input type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </label>
      <ErrorText error={error} />
      <button type="submit" disabled={busy}>
        가입하기
      </button>
      <p className="small muted">
        이미 계정이 있나요? <Link href="/login">로그인</Link>
      </p>
    </form>
  );
}
