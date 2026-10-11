"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OfferComposer } from "@/components/offer-composer";
import { ErrorText, RequireAuth, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, won, type Message, type NegotiationDetail, type Offer } from "@/lib/api";
import { useSession } from "@/lib/session";

const POLL_MS = 3000;

export default function NegotiationRoomPage() {
  return (
    <RequireAuth>
      <NegotiationRoom />
    </RequireAuth>
  );
}

function NegotiationRoom() {
  const { id } = useParams<{ id: string }>();
  const { user, refresh } = useSession();
  const [negotiation, setNegotiation] = useState<NegotiationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const loadNegotiation = useCallback(
    () =>
      unwrap(api.GET("/negotiations/{id}", { params: { path: { id } } }))
        .then(setNegotiation)
        .catch((err: Error) => setError(err.message)),
    [id],
  );

  // after=<마지막 메시지 id>로 새 메시지만 받아 뒤에 붙인다
  const pollMessages = useCallback(() => {
    const after = lastId.current;
    return api
      .GET("/negotiations/{id}/messages", { params: { path: { id }, query: after ? { after } : {} } })
      .then(({ data }) => {
        if (!data?.length || lastId.current !== after) return;
        lastId.current = data[data.length - 1].id;
        setMessages((prev) => (after ? [...prev, ...data] : data));
      });
  }, [id]);

  // 채팅과 제안 상태를 3초마다 갱신
  useEffect(() => {
    void loadNegotiation();
    void pollMessages();
    const timer = setInterval(() => {
      void pollMessages();
      void loadNegotiation();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadNegotiation, pollMessages]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await unwrap(api.POST("/negotiations/{id}/messages", { params: { path: { id } }, body: { body: draft } }));
      setDraft("");
      await Promise.all([pollMessages(), refresh()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function respond(offer: Offer, action: "accept" | "reject" | "withdraw") {
    setError(null);
    try {
      const path = { params: { path: { id: offer.id } } };
      if (action === "accept") await unwrap(api.POST("/offers/{id}/accept", path));
      if (action === "reject") await unwrap(api.POST("/offers/{id}/reject", path));
      if (action === "withdraw") await unwrap(api.POST("/offers/{id}/withdraw", path));
      await loadNegotiation();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!negotiation) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;

  const iAmWriter = negotiation.writerId === user?.id;
  const nameOf = (userId: string) =>
    userId === negotiation.writerId ? negotiation.writer.displayName : negotiation.producer.displayName;
  const latest = negotiation.latestOffer;
  const pending = latest?.status === "PROPOSED" ? latest : null;
  const open = negotiation.status === "OPEN";

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{negotiation.script.title}</h1>
          <p className="muted small">
            작가 <Link href={`/users/${negotiation.writer.id}`}>{negotiation.writer.displayName}</Link> · 제작자{" "}
            <Link href={`/users/${negotiation.producer.id}`}>{negotiation.producer.displayName}</Link> ({iAmWriter ? "나는 작가" : "나는 제작자"})
          </p>
        </div>
        <div className="row">
          <StatusBadge status={negotiation.status} />
          {negotiation.dealId && (
            <Link href={`/deals/${negotiation.dealId}`} className="button">
              딜 보기
            </Link>
          )}
        </div>
      </div>
      <ErrorText error={error} />
      {negotiation.status === "AGREED" && <p className="notice">합의가 이루어져 딜이 만들어졌습니다. 🎉</p>}
      {negotiation.status === "CLOSED" && <p className="notice">이 협상은 종료되었습니다.</p>}

      <div className="two-col">
        <section className="card stack">
          <h2>대화</h2>
          <div className="chat" ref={chatRef} aria-live="polite">
            {messages.length === 0 && <p className="muted small">첫 메시지를 보내보세요.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`bubble${m.senderId === user?.id ? " mine" : ""}`}>
                <div className="small muted">
                  {nameOf(m.senderId)} · {dateTime(m.createdAt)}
                </div>
                <div className="pre">{m.body}</div>
              </div>
            ))}
          </div>
          {negotiation.status !== "CLOSED" && (
            <form className="row" onSubmit={send}>
              <input
                placeholder="메시지 입력"
                aria-label="메시지"
                value={draft}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" aria-label="보내기">
                보내기 <span className="small">(1코인)</span>
              </button>
            </form>
          )}
        </section>

        <div className="stack">
          {pending && (
            <section className="card stack" aria-label="현재 제안">
              <h2>현재 제안</h2>
              <OfferTerms offer={pending} by={nameOf(pending.proposerId)} />
              {pending.proposerId === user?.id ? (
                <div className="row">
                  <span className="small muted">상대방의 응답을 기다리는 중</span>
                  <button className="ghost" onClick={() => respond(pending, "withdraw")}>
                    철회
                  </button>
                </div>
              ) : (
                <div className="row">
                  <button onClick={() => respond(pending, "accept")}>수락</button>
                  <button className="ghost" onClick={() => respond(pending, "reject")}>
                    거절
                  </button>
                </div>
              )}
            </section>
          )}
          {open && (
            <OfferComposer
              key={latest?.id ?? "new"}
              negotiationId={negotiation.id}
              base={latest}
              isCounter={Boolean(pending && pending.proposerId !== user?.id)}
              onSent={loadNegotiation}
            />
          )}
          <section className="card stack">
            <h2>제안 이력</h2>
            {negotiation.offers.length === 0 ? (
              <p className="muted small">아직 제안이 없습니다.</p>
            ) : (
              <ol className="timeline">
                {negotiation.offers.map((o) => (
                  <li key={o.id} className={o.status.toLowerCase()}>
                    <div className="spread small">
                      <span>
                        {nameOf(o.proposerId)} · {dateTime(o.createdAt)}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="small">
                      작가 {o.writerSharePct}% / 제작자 {o.producerSharePct}% · {won(o.upfrontFeeKrw)} · {o.termMonths}개월
                      {o.exclusive ? " · 독점" : ""}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function OfferTerms({ offer, by }: { offer: Offer; by: string }) {
  return (
    <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
      <dt className="muted">제안자</dt>
      <dd style={{ margin: 0 }}>{by}</dd>
      <dt className="muted">수익 분배</dt>
      <dd style={{ margin: 0 }}>
        작가 {offer.writerSharePct}% / 제작자 {offer.producerSharePct}%
      </dd>
      <dt className="muted">선급금</dt>
      <dd style={{ margin: 0 }}>{won(offer.upfrontFeeKrw)}</dd>
      <dt className="muted">기간</dt>
      <dd style={{ margin: 0 }}>{offer.termMonths}개월</dd>
      <dt className="muted">독점</dt>
      <dd style={{ margin: 0 }}>{offer.exclusive ? "예" : "아니오"}</dd>
      {offer.notes && (
        <>
          <dt className="muted">비고</dt>
          <dd style={{ margin: 0 }} className="pre">
            {offer.notes}
          </dd>
        </>
      )}
    </dl>
  );
}
