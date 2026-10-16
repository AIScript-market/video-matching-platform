"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VideoStatusBadge } from "@/components/deal-channel";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap, won, type Schemas } from "@/lib/api";

type Earnings = Schemas["EarningsDto"];

const ROLE: Record<string, string> = { WRITER: "작가", PRODUCER: "제작자", PERFORMER: "출연자", OTHER: "참여자", PLATFORM: "플랫폼" };
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

export default function EarningsPage() {
  return (
    <RequireAuth>
      <EarningsView />
    </RequireAuth>
  );
}

function EarningsView() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    unwrap(api.GET("/me/earnings"))
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!data) return <ErrorText error={error} />;
  const { totals, months, deals, videos } = data;
  const maxMonth = Math.max(1, ...months.map((m) => m.revenueKrw));

  return (
    <div className="stack">
      <h1>수익</h1>
      <p className="small muted">
        협상이 성사된 딜에서 만든 영상의 수익입니다. 확정 수익은 구글이 확정해 플랫폼에 지급한 광고 수익이고, 계약서의 배분율대로 나눈 내 몫을 다음 달 말일까지 지급합니다.
      </p>

      <section className="grid" aria-label="수익 요약">
        <Stat label="내 몫 (확정)" value={won(totals.myKrw)} strong />
        <Stat label="지급받음" value={won(totals.paidKrw)} />
        <Stat label="지급 예정" value={won(totals.unpaidKrw)} />
        <Stat label="딜 영상 전체 확정 수익" value={won(totals.revenueKrw)} hint={`게시된 영상 ${totals.publishedVideos}개`} />
      </section>

      <section className="card stack" aria-label="달별 수익">
        <h2 style={{ margin: 0 }}>달별 확정 수익</h2>
        {months.length === 0 ? (
          <p className="muted small">아직 확정된 수익이 없습니다. 게시한 영상의 수익은 구글이 확정한 뒤(보통 다음 달 중순) 기록됩니다.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {months.map((m) => (
              <div key={m.month} className="earn-row">
                <span className="small">{m.month}</span>
                <div className="earn-bar" title={`전체 ${won(m.revenueKrw)}`}>
                  <div className="earn-bar-total" style={{ width: `${(m.revenueKrw / maxMonth) * 100}%` }} />
                  <div className="earn-bar-mine" style={{ width: `${(m.myKrw / maxMonth) * 100}%` }} />
                </div>
                <span className="small">
                  <strong>{won(m.myKrw)}</strong> <span className="muted">/ {won(m.revenueKrw)}</span>
                </span>
              </div>
            ))}
            <p className="small muted" style={{ margin: 0 }}>
              진한 막대가 내 몫, 옅은 막대가 딜 영상 전체 수익입니다.
            </p>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="딜별 수익">
        <h2 style={{ margin: 0 }}>딜별</h2>
        {deals.length === 0 ? (
          <p className="muted small">
            아직 성사된 딜이 없습니다. <Link href="/scripts">대본 탐색</Link>이나 <Link href="/negotiations">협상</Link>에서 시작해 보세요.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>대본</th>
                  <th>내 역할·배분율</th>
                  <th>영상</th>
                  <th>확정 수익</th>
                  <th>내 몫</th>
                  <th>지급받음</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.dealId}>
                    <td>
                      <Link href={`/deals/${d.dealId}`}>{d.scriptTitle}</Link>
                      {d.status !== "ACTIVE" && <span className="small muted"> · {d.status === "PENDING_CONTRACT" ? "계약 서명 전" : "종료"}</span>}
                    </td>
                    <td className="small">{d.myRole ? `${ROLE[d.myRole]} ${d.myShareBp !== null ? pct(d.myShareBp) : ""}` : "-"}</td>
                    <td className="small">
                      게시 {d.publishedVideos} / 제출 {d.videoCount}
                    </td>
                    <td>{won(d.revenueKrw)}</td>
                    <td>
                      <strong>{won(d.myKrw)}</strong>
                    </td>
                    <td>{won(d.paidKrw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="영상별 수익">
        <h2 style={{ margin: 0 }}>영상별</h2>
        {videos.length === 0 ? (
          <p className="muted small">아직 제출한 영상이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>영상</th>
                  <th>상태</th>
                  <th>게시</th>
                  <th>확정 수익</th>
                  <th>내 몫</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.videoId}>
                    <td>
                      {v.youtubeVideoId ? (
                        <a href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`} target="_blank" rel="noreferrer">
                          {v.title}
                        </a>
                      ) : (
                        v.title
                      )}
                      <p className="small muted" style={{ margin: 0 }}>
                        「{v.scriptTitle}」{v.channelName && ` · ${v.channelName}`}
                      </p>
                    </td>
                    <td>
                      <VideoStatusBadge status={v.status} />
                    </td>
                    <td className="small">{v.publishedAt ? dateTime(v.publishedAt) : "-"}</td>
                    <td>{won(v.revenueKrw)}</td>
                    <td>
                      <strong>{won(v.myKrw)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="card stack" style={{ gap: 4 }}>
      <span className="small muted">{label}</span>
      <span style={{ fontSize: strong ? "1.6rem" : "1.3rem", fontWeight: 700 }}>{value}</span>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}
