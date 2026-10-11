"use client";

import { notFound } from "next/navigation";
import { useSyncExternalStore } from "react";
import { accountOrigin, DEV_ACCOUNTS, DEV_ACCOUNTS_ENABLED } from "@/lib/dev-accounts";

const subscribe = () => () => {};

export default function DevAccountsPage() {
  if (!DEV_ACCOUNTS_ENABLED) notFound();
  return <DevAccounts />;
}

function DevAccounts() {
  // 서버 렌더링에서는 포트를 알 수 없어서 브라우저에서 읽는다
  const port = useSyncExternalStore(subscribe, () => window.location.port, () => "3000");

  return (
    <div className="stack">
      <h1>계정별 접속 주소 (개발용)</h1>
      <p className="small muted">
        계정마다 주소가 따로라서 로그인이 섞이지 않습니다. 여러 탭에 서로 다른 계정을 띄워 놓고 흐름을 시험해 보세요.
        &ldquo;바로 로그인&rdquo;을 누르면 그 주소에서 해당 계정으로 자동 로그인합니다.
      </p>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>계정</th>
              <th>역할</th>
              <th>접속 주소</th>
              <th>아이디 / 비밀번호</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {DEV_ACCOUNTS.map((a) => {
              const origin = accountOrigin(a.key, port);
              return (
                <tr key={a.key}>
                  <td>
                    <strong>{a.label}</strong>
                    <div className="small muted">{a.note}</div>
                  </td>
                  <td>{a.role}</td>
                  <td className="small">
                    <a href={origin} target="_blank" rel="noreferrer">
                      {origin.replace("http://", "")}
                    </a>
                  </td>
                  <td className="small">
                    {a.email}
                    <div className="muted">{a.password}</div>
                  </td>
                  <td>
                    <a className="button" href={`${origin}/dev/login?as=${a.key}`} target="_blank" rel="noreferrer">
                      바로 로그인
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
