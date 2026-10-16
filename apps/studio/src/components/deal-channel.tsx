"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ContractPanel, ContractStatus } from "@/components/contract-view";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, won, type ChannelVideo, type Contract, type ContractSummary, type Deal, type Settlement } from "@/lib/api";
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

const SHARE_ROLE: Record<string, string> = { WRITER: "작가", PRODUCER: "제작자", PERFORMER: "출연자", OTHER: "참여자" };
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

/** 정산서: 영상·월별 확정 수익을 그 달 계약의 당사자별 몫으로 (관리자는 지급 기록 버튼) */
export function DealSettlement({ dealId }: { dealId: string }) {
  const { has } = useSession();
  const [s, setS] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    unwrap(api.GET("/deals/{id}/settlement", { params: { path: { id: dealId } } }))
      .then(setS)
      .catch((err: Error) => setError(err.message));
  }, [dealId]);

  async function pay(revenueId: string, partyId: string) {
    setError(null);
    try {
      setS(await unwrap(api.POST("/admin/revenues/{id}/payouts", { params: { path: { id: revenueId } }, body: { partyId } })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!s) return <ErrorText error={error} />;

  return (
    <section className="card stack" aria-label="정산">
      <h2>정산</h2>
      <p className="small muted">
        YouTube가 확정한 월 광고 수익을 그 달에 적용되는 계약의 배분율대로 나눕니다. 플랫폼 몫은 0원이고, 구글 지급을 받은 다음 달 말일까지 정산합니다.
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
                <th>당사자</th>
                <th className="num">배분율</th>
                <th className="num">몫</th>
                <th>지급</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.flatMap((l) =>
                l.shares.map((x, i) => (
                  <tr key={`${l.id}-${x.partyId}`}>
                    <td>{i === 0 ? l.month : ""}</td>
                    <td>{i === 0 ? l.videoTitle : ""}</td>
                    <td className="num">{i === 0 ? won(l.amountKrw) : ""}</td>
                    <td>
                      {SHARE_ROLE[x.role]}
                      {x.label ? `(${x.label})` : ""} {x.name}
                    </td>
                    <td className="num">{pct(x.revenueShareBp)}</td>
                    <td className="num">{won(x.amountKrw)}</td>
                    <td>
                      {x.payout ? (
                        <span className="small">지급 {dateTime(x.payout.paidAt)}</span>
                      ) : has("ADMIN") ? (
                        <button className="secondary small" onClick={() => pay(l.id, x.partyId)}>
                          지급 기록
                        </button>
                      ) : (
                        <span className="badge warn">지급 전</span>
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">
        합계 {won(s.totalRevenueKrw)}
        {s.totals.map((t) => (
          <span key={t.userId}>
            {" "}
            · {SHARE_ROLE[t.role]} {t.name} {won(t.dueKrw)} (지급 {won(t.paidKrw)})
          </span>
        ))}
      </p>
      <p className="small muted">
        베타 기간에는 플랫폼 밖에서 이체한 뒤 기록합니다. 정산 기준은 <Link href="/contracts">계약</Link>의 대본 이용허락 계약 제6·7조에 있습니다.
      </p>
    </section>
  );
}

/** 이용허락 계약 이력과 변경 계약 제안 (공동 작가·공동 제작자 추가, 배분율 변경. 출연자는 배우 기능이 열리면) */
export function DealAmendments({ deal, onChange }: { deal: Deal; onChange: () => void }) {
  const { user, config } = useSession();
  const [history, setHistory] = useState<ContractSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      unwrap(api.GET("/deals/{id}/contracts", { params: { path: { id: deal.id } } }))
        .then(setHistory)
        .catch((err: Error) => setError(err.message)),
    [deal.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const current = history.find((c) => c.status === "SIGNED");
  const pending = history.some((c) => c.status === "AWAITING_SIGNATURES");
  const canPropose = Boolean(current) && !pending && (user?.id === deal.writer.id || user?.id === deal.producer.id);
  const roles: Array<[AmendRole, string]> = [
    ["WRITER", "작가"],
    ["PRODUCER", "제작자"],
    ["OTHER", "참여자"],
    ...(config?.features.casting ? ([["PERFORMER", "출연자"]] as Array<[AmendRole, string]>) : []),
  ];

  return (
    <section className="card stack" aria-label="계약 이력">
      <div className="spread">
        <h2 style={{ margin: 0 }}>계약 이력</h2>
        {canPropose && !open && (
          <button className="secondary" onClick={() => setOpen(true)}>
            당사자 추가·배분 변경
          </button>
        )}
      </div>
      <ErrorText error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>계약</th>
              <th>상태</th>
              <th>적용</th>
              <th>당사자와 배분율</th>
            </tr>
          </thead>
          <tbody>
            {history.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/contracts/${c.id}`}>{c.supersedesId ? "변경 계약" : "처음 계약"}</Link>
                  <span className="small muted"> {dateTime(c.createdAt)}</span>
                </td>
                <td>
                  <ContractStatus status={c.status} />
                </td>
                <td className="small">{c.effectiveMonth ? `${c.effectiveMonth}부터` : "처음부터"}</td>
                <td className="small">
                  {c.parties
                    .filter((p) => p.role !== "PLATFORM")
                    .map((p) => `${SHARE_ROLE[p.role] ?? p.role}${p.label ? `(${p.label})` : ""} ${p.legalName} ${p.revenueShareBp === null ? "-" : pct(p.revenueShareBp)}`)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && current && (
        <AmendForm
          dealId={deal.id}
          current={current}
          roles={roles}
          onDone={async () => {
            setOpen(false);
            await load();
            onChange();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
      <p className="small muted">변경 계약은 모든 당사자가 서명하면 그다음 달 1일부터 발생하는 수익에 적용되고, 그 전 수익은 예전 배분을 따릅니다.</p>
    </section>
  );
}

type AmendRole = "WRITER" | "PRODUCER" | "PERFORMER" | "OTHER";
interface Row {
  userId: string;
  name: string;
  role: AmendRole;
  label: string;
  percent: string;
  remainder: boolean;
}

function AmendForm({
  dealId,
  current,
  roles,
  onDone,
  onCancel,
}: {
  dealId: string;
  current: ContractSummary;
  roles: Array<[AmendRole, string]>;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    current.parties
      .filter((p) => p.role !== "PLATFORM" && p.userId)
      .map((p) => ({
        userId: p.userId!,
        name: p.legalName,
        role: p.role as AmendRole,
        label: p.label ?? "",
        percent: p.revenueShareBp === null ? "" : String(p.revenueShareBp / 100),
        remainder: p.receivesRemainder,
      })),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = rows.reduce((a, r) => a + (Number(r.percent) || 0), 0);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/deals/{id}/contract/amendments", {
          params: { path: { id: dealId } },
          body: {
            notes: notes || undefined,
            parties: rows.map((r) => ({
              userId: r.userId.trim(),
              role: r.role,
              label: r.label || undefined,
              revenueShareBp: r.percent === "" ? null : Math.round(Number(r.percent) * 100),
              receivesRemainder: r.remainder,
            })),
          },
        }),
      );
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} aria-label="변경 계약 제안">
      <h3>변경 계약 제안</h3>
      <p className="small muted">새 당사자는 상대의 공개 프로필 주소(/users/계정ID)에 있는 계정 ID로 넣습니다. 지금 계약의 작가와 제작자는 뺄 수 없습니다.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>계정 ID</th>
              <th>역할</th>
              <th>구분</th>
              <th className="num">배분율(%)</th>
              <th>내림 차이</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.name ? (
                    <span className="small">{r.name}</span>
                  ) : (
                    <input aria-label={`당사자 ${i + 1} 계정 ID`} value={r.userId} onChange={(e) => set(i, { userId: e.target.value })} />
                  )}
                </td>
                <td>
                  <select aria-label={`당사자 ${i + 1} 역할`} value={r.role} onChange={(e) => set(i, { role: e.target.value as AmendRole })} disabled={Boolean(r.name)}>
                    {roles.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input aria-label={`당사자 ${i + 1} 구분`} placeholder="예: 공동 작가" maxLength={40} value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
                </td>
                <td className="num">
                  <input aria-label={`당사자 ${i + 1} 배분율`} inputMode="decimal" value={r.percent} onChange={(e) => set(i, { percent: e.target.value.replace(/[^0-9.]/g, "") })} />
                </td>
                <td>
                  <input
                    aria-label={`당사자 ${i + 1} 내림 차이`}
                    type="radio"
                    name="remainder"
                    checked={r.remainder}
                    onChange={() => setRows(rows.map((x, j) => ({ ...x, remainder: j === i })))}
                  />
                </td>
                <td>{!r.name && <button type="button" className="ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>빼기</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button type="button" className="secondary small" onClick={() => setRows([...rows, { userId: "", name: "", role: "OTHER", label: "", percent: "", remainder: false }])}>
          + 당사자 추가
        </button>
        <span className={`small ${Math.abs(total - 100) < 0.001 ? "muted" : "error"}`}>합계 {total.toFixed(2)}%</span>
      </div>
      <label>
        변경 사유·특약 (선택)
        <textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <ErrorText error={error} />
      <div className="row">
        <button type="submit" disabled={busy || Math.abs(total - 100) > 0.001}>
          변경 계약 만들기
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
