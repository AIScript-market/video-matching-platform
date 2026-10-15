"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VideoStatusBadge } from "@/components/deal-channel";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap, type ChannelVideo } from "@/lib/api";

type Status = ChannelVideo["status"];
const TABS: Array<[Status, string]> = [
  ["SUBMITTED", "검수 대기"],
  ["APPROVED", "게시 대기"],
  ["PUBLISHED", "게시됨"],
  ["REJECTED", "거절"],
  ["REMOVED", "게시 중단"],
];

export default function AdminVideosPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminVideos />
    </RequireAuth>
  );
}

function AdminVideos() {
  const [tab, setTab] = useState<Status>("SUBMITTED");
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/admin/videos", { params: { query: { status: tab } } }))
        .then(setVideos)
        .catch((err: Error) => setError(err.message)),
    [tab],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="stack">
      <h1>영상 검수</h1>
      <p className="small muted">
        제작자가 제출한 영상의 권리 항목과 내용을 확인하고 승인합니다. 승인한 영상은 YouTube Studio에서 장르 채널에 직접 올린 뒤 영상 번호를 기록합니다.
        끝난 달의 확정 광고 수익은 영상마다 기록하고, 지급은 딜 화면의 정산에서 기록합니다.
      </p>
      <div className="row">
        {TABS.map(([s, label]) => (
          <button key={s} className={s === tab ? undefined : "secondary"} onClick={() => setTab(s)}>
            {label}
          </button>
        ))}
      </div>
      <ErrorText error={error} />
      {notice && <p className="notice small">{notice}</p>}
      {videos.length === 0 && <p className="muted">해당하는 영상이 없습니다.</p>}
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} act={act} />
      ))}
    </div>
  );
}

function VideoCard({ video: v, act }: { video: ChannelVideo; act: (fn: () => Promise<unknown>, done: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [channelName, setChannelName] = useState("");
  const [youtubeId, setYoutubeId] = useState("");
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");
  const path = { params: { path: { id: v.id } } };
  const r = v.rightsChecklist;

  return (
    <section className="card stack" aria-label={v.title}>
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>{v.title}</h2>
          <p className="small muted">
            「{v.scriptTitle}」 · 제출 {dateTime(v.createdAt)} · <Link href={`/deals/${v.dealId}`}>딜 보기</Link>
          </p>
        </div>
        <VideoStatusBadge status={v.status} />
      </div>
      <p className="small">
        검수용 링크:{" "}
        <a href={v.sourceUrl} target="_blank" rel="noreferrer">
          {v.sourceUrl}
        </a>
      </p>
      {v.description && <p className="small pre">{v.description}</p>}
      <p className="small">
        권리 확인: 음원 {r.musicCleared ? "✓" : "✗"} · 소재 {r.materialsCleared ? "✓" : "✗"} · 출연자 동의 {r.performersConsented ? "✓" : "✗"} · 광고 표시{" "}
        {r.adDisclosureChecked ? "✓" : "✗"} · 유료 광고 {r.containsPaidPromotion ? <strong>있음 (표시 확인 필요)</strong> : "없음"}
      </p>
      {r.sources && <p className="small pre">출처: {r.sources}</p>}
      {v.reviewNote && <p className="small muted">메모: {v.reviewNote}</p>}
      {v.youtubeVideoId && (
        <p className="small">
          {v.channelName} ·{" "}
          <a href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`} target="_blank" rel="noreferrer">
            {v.youtubeVideoId}
          </a>
        </p>
      )}

      {v.status === "SUBMITTED" && (
        <div className="stack">
          <label>
            검수 메모 (거절하면 필수, 제작자에게 보임)
            <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={() => act(() => unwrap(api.POST("/admin/videos/{id}/review", { ...path, body: { decision: "APPROVED", note: note || undefined } })), "승인했습니다")}>
              승인
            </button>
            <button className="secondary" onClick={() => act(() => unwrap(api.POST("/admin/videos/{id}/review", { ...path, body: { decision: "REJECTED", note } })), "거절했습니다")}>
              거절
            </button>
          </div>
        </div>
      )}

      {v.status === "APPROVED" && (
        <div className="row">
          <input placeholder="채널 이름" value={channelName} maxLength={100} onChange={(e) => setChannelName(e.target.value)} />
          <input placeholder="YouTube 영상 번호 (11자)" value={youtubeId} maxLength={11} onChange={(e) => setYoutubeId(e.target.value)} />
          <button
            onClick={() => act(() => unwrap(api.POST("/admin/videos/{id}/publish", { ...path, body: { channelName, youtubeVideoId: youtubeId } })), "게시를 기록했습니다")}
          >
            게시 기록
          </button>
        </div>
      )}

      {v.status === "PUBLISHED" && (
        <div className="stack">
          <div className="row">
            <input placeholder="정산 월 YYYY-MM" value={month} maxLength={7} onChange={(e) => setMonth(e.target.value)} />
            <input placeholder="확정 수익 (원)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
            <button
              onClick={() =>
                act(() => unwrap(api.POST("/admin/videos/{id}/revenues", { ...path, body: { month, amountKrw: Number(amount) } })), `${month} 수익을 기록했습니다`)
              }
              disabled={!month || !amount}
            >
              수익 기록
            </button>
          </div>
          <div className="row">
            <input placeholder="게시 중단 이유" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            <button className="secondary" disabled={!note.trim()} onClick={() => act(() => unwrap(api.POST("/admin/videos/{id}/remove", { ...path, body: { note } })), "게시를 중단했습니다")}>
              게시 중단
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
