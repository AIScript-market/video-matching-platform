"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, RequireAuth, RoleBadges } from "@/components/ui";
import { api, dateTime, unwrap, won, type CoinTransaction, type Schemas, type Wallet } from "@/lib/api";
import { useSession } from "@/lib/session";

const TX_LABEL: Record<CoinTransaction["type"], string> = {
  SIGNUP_BONUS: "가입 보너스",
  PURCHASE: "구매",
  SPEND: "사용",
  ADMIN_ADJUST: "관리자 조정",
};
const USE_LABEL: Record<string, string> = { MESSAGE: "메시지", PREVIEW_UNLOCK: "미리보기 열람", SCRIPT_UPLOAD: "대본 업로드" };

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}

function Account() {
  const { user } = useSession();
  if (!user) return null;
  const isAdmin = user.roles.includes("ADMIN");
  return (
    <div className="stack">
      <div className="spread">
        <h1>내 계정</h1>
        <div className="row">
          <RoleBadges roles={user.roles} />
          <span className="small muted">{user.email}</span>
        </div>
      </div>
      {!isAdmin && <ProfileSection />}
      {!isAdmin && <CoinSection />}
      {!isAdmin && <WithdrawSection />}
      {isAdmin && <p className="muted">관리자 계정입니다. 관리자 화면에서 계정 정지·코인 지급·로그를 관리합니다.</p>}
    </div>
  );
}

function ProfileSection() {
  const { user, refresh } = useSession();
  const [form, setForm] = useState({
    displayName: user!.displayName,
    bio: user!.bio ?? "",
    profilePublic: user!.profilePublic,
    emailPublic: user!.emailPublic,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await unwrap(api.PATCH("/me/profile", { body: form }));
      await refresh();
      setNotice("저장했습니다.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form id="profile" className="card stack" onSubmit={save} aria-label="프로필">
      <div className="spread">
        <h2 style={{ margin: 0 }}>프로필</h2>
        {user!.creatorReady ? (
          <span className="badge ok">대본 제공·영상 제작 가능</span>
        ) : (
          <span className="badge warn">프로필·이메일 공개 필요</span>
        )}
      </div>
      <p className="small muted">
        대본을 올리거나 제작을 제안하려면 <strong>소개를 쓰고 프로필과 이메일을 공개</strong>해야 합니다. 공개 프로필에는 이름, 소개, 이메일, 공개한 대본이 보입니다.
      </p>
      <label>
        이름(활동명)
        <input required maxLength={40} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </label>
      <label>
        소개
        <textarea
          maxLength={1000}
          placeholder="경력, 작품, 관심 장르 등"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.profilePublic} onChange={(e) => setForm({ ...form, profilePublic: e.target.checked })} />
        <span>프로필 공개</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={form.emailPublic} onChange={(e) => setForm({ ...form, emailPublic: e.target.checked })} />
        <span>
          이메일 공개 <span className="muted small">({user!.email})</span>
        </span>
      </label>
      <ErrorText error={error} />
      {notice && <p className="notice small">{notice}</p>}
      <div className="row">
        <button type="submit">프로필 저장</button>
        {user!.profilePublic && (
          <Link href={`/users/${user!.id}`} className="button secondary">
            내 공개 프로필 보기
          </Link>
        )}
      </div>
    </form>
  );
}

function CoinSection() {
  const { refresh } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<CoinTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/coins")), unwrap(api.GET("/coins/transactions"))])
        .then(([w, h]) => {
          setWallet(w);
          setHistory(h.items);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(packageId: string, label: string) {
    setError(null);
    setNotice(null);
    try {
      await unwrap(api.POST("/coins/purchase", { body: { packageId: packageId as Schemas["PurchaseCoinsDto"]["packageId"] } }));
      setNotice(`${label}을(를) 충전했습니다.`);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section id="coins" className="card stack" aria-label="코인">
      <div className="spread">
        <h2 style={{ margin: 0 }}>코인</h2>
        <strong data-testid="wallet-balance">🪙 {wallet?.balance ?? "-"}코인</strong>
      </div>
      {wallet && (
        <>
          <p className="small muted">
            메시지 {wallet.prices.MESSAGE}코인 · 미리보기 열람 {wallet.prices.PREVIEW_UNLOCK}코인(대본당 한 번) · 대본 파일 업로드 {wallet.prices.SCRIPT_UPLOAD}코인
          </p>
          <div className="grid">
            {wallet.packages.map((p) => (
              <div key={p.id} className="card stack">
                <strong>{p.label}</strong>
                <span className="muted">{won(p.priceKrw)}</span>
                <button onClick={() => buy(p.id, p.label)}>구매</button>
              </div>
            ))}
          </div>
          {wallet.testPayments && (
            <p className="small muted">※ 지금은 실제 결제가 연결되어 있지 않아 테스트 결제로 바로 충전됩니다.</p>
          )}
        </>
      )}
      <ErrorText error={error} />
      {notice && <p className="notice small">{notice}</p>}
      <h3>사용·충전 내역</h3>
      {history.length === 0 ? (
        <p className="muted small">내역이 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>구분</th>
                <th className="num">코인</th>
                <th className="num">잔액</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id}>
                  <td className="small">{dateTime(t.createdAt)}</td>
                  <td>
                    {TX_LABEL[t.type]}
                    {t.use && <span className="muted small"> · {USE_LABEL[t.use]}</span>}
                  </td>
                  <td className="num" style={{ color: t.amount < 0 ? "var(--danger)" : "var(--success)" }}>
                    {t.amount > 0 ? `+${t.amount}` : t.amount}
                  </td>
                  <td className="num">{t.balanceAfter}</td>
                  <td className="small">{t.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WithdrawSection() {
  const router = useRouter();
  const { refresh } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await unwrap(api.DELETE("/me", { body: { password } }));
      await refresh();
      router.push("/scripts");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card stack" onSubmit={withdraw} aria-label="회원 탈퇴">
      <h2 style={{ margin: 0 }}>회원 탈퇴</h2>
      <p className="small muted">
        탈퇴하면 공개한 대본이 내려가고, 진행 중인 협상이 종료되며, 남은 코인은 사라집니다. 같은 이메일로 다시 가입할 수 있습니다.
      </p>
      <label>
        비밀번호 확인
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        <span>위 내용을 확인했고 탈퇴합니다</span>
      </label>
      <ErrorText error={error} />
      <button type="submit" className="danger" disabled={!confirm || !password}>
        탈퇴하기
      </button>
    </form>
  );
}
