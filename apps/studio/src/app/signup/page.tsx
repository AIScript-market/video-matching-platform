"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap, type RequestableRole } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [requested, setRequested] = useState<RequestableRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (role: RequestableRole) =>
    setRequested((rs) => (rs.includes(role) ? rs.filter((r) => r !== role) : [...rs, role]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(api.POST("/auth/signup", { body: { ...form, requestedRoles: requested } }));
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
        가입하면 <strong>일반 계정</strong>으로 시작합니다. 대본을 올리거나 제작을 제안하려면 권한을 신청하고 관리자의 승인을 받으세요.
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
      <fieldset className="stack" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
        <legend className="small">가입하면서 권한 신청 (선택, 둘 다 가능)</legend>
        <label className="check">
          <input type="checkbox" checked={requested.includes("WRITER")} onChange={() => toggle("WRITER")} />
          <span>
            대본 제공자 <span className="muted small">— 대본을 올리고 제작 제안을 받습니다</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={requested.includes("PRODUCER")} onChange={() => toggle("PRODUCER")} />
          <span>
            영상 제작자 <span className="muted small">— 대본 전문을 열람하고 제작을 제안합니다</span>
          </span>
        </label>
      </fieldset>
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
