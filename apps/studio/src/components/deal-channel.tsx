"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ContractPanel } from "@/components/contract-view";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, won, type ChannelVideo, type Contract, type Deal, type Settlement } from "@/lib/api";
import { useSession } from "@/lib/session";

const VIDEO_STATUS: Record<ChannelVideo["status"], [string, string]> = {
  SUBMITTED: ["검수 대기", "warn"],
  APPROVED: ["승인 · 게시 대기", "ok"],
  PUBLISHED: ["채널 게시", "ok"],
  REJECTED: ["거절", "bad"],
  REMOVED: ["게시 중단", "bad"],
};

export function VideoStatusBadge({ status }: { status: ChannelVideo["status"] }) {
  const [label, tone] = VIDEO_STATUS[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

/** 딜의 대본 이용허락 계약서 (양쪽이 서명하면 딜이 진행 중이 된다) */
export function DealContract({ dealId, onSigned }: { dealId: string; onSigned: () => void }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    unwrap(api.GET("/deals/{id}/contract", { params: { path: { id: dealId } } }))
      .then(setContract)
      .catch((err: Error) => setError(err.message));
  }, [dealId]);
  if (!contract) return <ErrorText error={error} />;
  return (
    <ContractPanel
      contract={contract}
      onChange={(c) => {
        setContract(c);
        if (c.status === "SIGNED") onSigned();
      }}
    />
  );
}

/** 영상 제출(제작자)과 제출 목록 */
export function DealVideos({ deal }: { deal: Deal }) {
  const { user } = useSession();
  const isProducer = user?.id === deal.producer.id;
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      unwrap(api.GET("/deals/{id}/videos", { params: { path: { id: deal.id } } }))
        .then(setVideos)
        .catch((err: Error) => setError(err.message)),
    [deal.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card stack" aria-label="채널 영상">
      <h2>채널 영상</h2>
      <p className="small muted">
        완성한 영상은 플랫폼의 장르 채널에 올라갑니다. YouTube 광고 수익은 <strong>전액</strong> 작가와 제작자에게 합의한 비율대로 나눕니다.
      </p>
      <ErrorText error={error} />
      {videos.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>상태</th>
                <th>채널</th>
                <th>제출</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.youtubeVideoId ? (
                      <a href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`} target="_blank" rel="noreferrer">
                        {v.title}
                      </a>
                    ) : (
                      v.title
                    )}
                    {v.reviewNote && <p className="small muted">검수 메모: {v.reviewNote}</p>}
                  </td>
                  <td>
                    <VideoStatusBadge status={v.status} />
                  </td>
                  <td className="small">{v.channelName ?? "-"}</td>
                  <td className="small">{dateTime(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isProducer && deal.status === "ACTIVE" && <SubmitVideo dealId={deal.id} onSubmitted={load} />}
      {isProducer && deal.status !== "ACTIVE" && <p className="small muted">대본 이용허락 계약에 양쪽이 서명하면 영상을 제출할 수 있습니다.</p>}
    </section>
  );
}

const RIGHTS: Array<[keyof Omit<ChannelVideo["rightsChecklist"], "sources" | "containsPaidPromotion">, string]> = [
  ["musicCleared", "쓴 음원은 모두 이용 권한이 있습니다"],
  ["materialsCleared", "영상·이미지·폰트 등 소재는 모두 이용 권한이 있습니다"],
  ["performersConsented", "출연자 전원에게 출연과 초상 이용 동의를 받았습니다"],
  ["adDisclosureChecked", "광고가 있으면 \"유료 광고 포함\"을 표시했습니다 (없으면 없음을 확인했습니다)"],
];

function SubmitVideo({ dealId, onSubmitted }: { dealId: string; onSubmitted: () => Promise<unknown> }) {
  const [channel, setChannel] = useState<Contract | null>(null);
  const [form, setForm] = useState({ title: "", description: "", sourceUrl: "", sources: "", containsPaidPromotion: false });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.POST("/contracts/channel-publishing")).then(setChannel).catch((err: Error) => setError(err.message));
  }, []);

  if (!channel) return <ErrorText error={error} />;
  if (channel.status !== "SIGNED")
    return (
      <div className="stack">
        <p className="notice small">영상을 처음 제출하기 전에 채널 게시 계약에 서명해 주세요. 제작자마다 한 번만 서명합니다.</p>
        <ContractPanel contract={channel} onChange={setChannel} />
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/deals/{id}/videos", {
          params: { path: { id: dealId } },
          body: {
            title: form.title,
            description: form.description || undefined,
            sourceUrl: form.sourceUrl,
            rights: {
              // 제출 버튼은 네 항목을 모두 확인해야 눌린다
              musicCleared: true,
              materialsCleared: true,
              performersConsented: true,
              adDisclosureChecked: true,
              containsPaidPromotion: form.containsPaidPromotion,
              sources: form.sources || undefined,
            },
          },
        }),
      );
      setForm({ title: "", description: "", sourceUrl: "", sources: "", containsPaidPromotion: false });
      setChecks({});
      await onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} aria-label="영상 제출">
      <h3>영상 제출</h3>
      <label>
        제목
        <input id="video-title" required maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        검수용 영상 링크 (비공개 링크, https)
        <input id="video-url" type="url" required placeholder="https://" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
      </label>
      <label>
        설명 (선택)
        <textarea id="video-description" maxLength={5000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <label>
        음원·소재 출처 (곡명, 라이선스 등)
        <textarea id="video-sources" maxLength={2000} value={form.sources} onChange={(e) => setForm({ ...form, sources: e.target.value })} />
      </label>
      <label className="check">
        <input id="video-paid" type="checkbox" checked={form.containsPaidPromotion} onChange={(e) => setForm({ ...form, containsPaidPromotion: e.target.checked })} />
        <span>이 영상에는 유료 광고(협찬·PPL)가 들어 있습니다</span>
      </label>
      {RIGHTS.map(([key, label]) => (
        <label key={key} className="check">
          <input id={`right-${key}`} type="checkbox" checked={Boolean(checks[key])} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />
          <span>{label}</span>
        </label>
      ))}
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy || RIGHTS.some(([k]) => !checks[k])}>
          제출하기
        </button>
      </div>
    </form>
  );
}

/** 정산서: 영상·월별 확정 수익, 작가·제작자 몫, 지급 기록 (관리자는 지급 기록 버튼) */
export function DealSettlement({ dealId }: { dealId: string }) {
  const { has } = useSession();
  const [s, setS] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    unwrap(api.GET("/deals/{id}/settlement", { params: { path: { id: dealId } } }))
      .then(setS)
      .catch((err: Error) => setError(err.message));
  }, [dealId]);

  async function pay(revenueId: string, role: "WRITER" | "PRODUCER") {
    setError(null);
    try {
      setS(await unwrap(api.POST("/admin/revenues/{id}/payouts", { params: { path: { id: revenueId } }, body: { role } })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!s) return <ErrorText error={error} />;
  const paidCell = (line: Settlement["lines"][number], role: "WRITER" | "PRODUCER") => {
    const p = line.payouts.find((x) => x.role === role);
    if (p) return <span className="small">지급 {dateTime(p.paidAt)}</span>;
    return has("ADMIN") ? (
      <button className="secondary small" onClick={() => pay(line.id, role)}>
        지급 기록
      </button>
    ) : (
      <span className="badge warn">지급 전</span>
    );
  };

  return (
    <section className="card stack" aria-label="정산">
      <h2>정산</h2>
      <p className="small muted">
        YouTube가 확정한 월 광고 수익 기준 · 작가 {s.writerSharePct}% / 제작자 {s.producerSharePct}% · 플랫폼 몫 0원. 구글 지급을 받은 다음 달 말일까지 정산합니다.
      </p>
      <ErrorText error={error} />
      {s.lines.length === 0 ? (
        <p className="muted small">아직 확정 수익이 없습니다. 새 채널은 수익 창출 조건을 넘기 전까지 광고 수익이 없을 수 있습니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>월</th>
                <th>영상</th>
                <th className="num">확정 수익</th>
                <th className="num">작가</th>
                <th>작가 지급</th>
                <th className="num">제작자</th>
                <th>제작자 지급</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.month}</td>
                  <td>{l.videoTitle}</td>
                  <td className="num">{won(l.amountKrw)}</td>
                  <td className="num">{won(l.writerKrw)}</td>
                  <td>{paidCell(l, "WRITER")}</td>
                  <td className="num">{won(l.producerKrw)}</td>
                  <td>{paidCell(l, "PRODUCER")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">
        합계 {won(s.totalRevenueKrw)} · 작가 {won(s.writerDueKrw)} (지급 {won(s.writerPaidKrw)}) · 제작자 {won(s.producerDueKrw)} (지급 {won(s.producerPaidKrw)})
      </p>
      <p className="small muted">
        베타 기간에는 플랫폼 밖에서 이체한 뒤 기록합니다. 문의는 <Link href="/contracts">계약</Link>의 채널 게시 계약 제4조를 참고하세요.
      </p>
    </section>
  );
}
