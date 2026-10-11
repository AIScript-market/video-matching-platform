"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorText, Modal, StatusBadge } from "@/components/ui";
import { api, dateTime, unwrap, type ScriptDetail } from "@/lib/api";
import { ReviewMessage } from "@/components/review-message";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { useSession } from "@/lib/session";

export default function ScriptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, has } = useSession();
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ndaOpen, setNdaOpen] = useState(false);
  const [ndaChecked, setNdaChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      unwrap(api.GET("/scripts/{id}", { params: { path: { id } } }))
        .then((data) => {
          setScript(data);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  // AI 요약을 만드는 중이면 끝날 때까지 3초마다 다시 불러온다
  useEffect(() => {
    if (!script?.aiSummaryPending) return;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [script, load]);

  async function requestAccess() {
    setBusy(true);
    try {
      await unwrap(api.POST("/scripts/{id}/access-requests", { params: { path: { id } }, body: { ndaAccepted: true } }));
      setNdaOpen(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startNegotiation() {
    setBusy(true);
    try {
      const n = await unwrap(api.POST("/scripts/{id}/negotiations", { params: { path: { id } } }));
      router.push(`/negotiations/${n.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!script) return error ? <ErrorText error={error} /> : <p className="muted">불러오는 중…</p>;
  const { viewer } = script;
  const isProducer = has("PRODUCER") && !viewer.isAuthor;

  return (
    <div className="two-col">
      <article className="stack">
        <div className="row">
          <span className="badge">{script.genre}</span>
          <StatusBadge status={script.status} />
          {viewer.isAuthor && <span className="badge plain">내 대본</span>}
        </div>
        <h1>{script.title}</h1>
        <p className="muted">
          by {script.author.displayName} · <span className="small">최근 수정 {dateTime(script.contentUpdatedAt)}</span>
        </p>
        <p style={{ fontSize: "1.1rem" }}>{script.logline}</p>

        <AiSummaryCard script={script} onUpdated={setScript} />

        <section className="card stack">
          <h2>시놉시스</h2>
          <p className="pre">{script.synopsis}</p>
        </section>

        <section className="card stack">
          <h2>대본 전문</h2>
          {script.fullText !== null ? (
            <pre className="pre" style={{ fontFamily: "inherit", margin: 0 }}>
              {script.fullText}
            </pre>
          ) : (
            <p className="muted">전문은 작가와 열람 승인을 받은 제작자만 볼 수 있습니다.</p>
          )}
        </section>

        {script.previewText !== null && script.fullText === null && (
          <section className="card stack" aria-label="미리보기 대본">
            <h2>미리보기 대본</h2>
            <p className="small muted">작가가 제작자에게 공개한 일부분입니다. 전문은 열람 승인 후에 볼 수 있습니다.</p>
            <pre className="pre" style={{ fontFamily: "inherit", margin: 0 }}>
              {script.previewText}
            </pre>
          </section>
        )}
        {script.previewText !== null && viewer.isAuthor && (
          <p className="small muted">미리보기 대본이 있습니다. 열람 승인 전 영상 제작자에게 보입니다.</p>
        )}
      </article>

      <aside className="stack">
        <div className="card stack">
          {viewer.isAuthor ? (
            <>
              <p>내가 쓴 대본입니다.</p>
              <Link href={`/dashboard/scripts/${script.id}`} className="button">
                수정·공개 관리
              </Link>
            </>
          ) : !user ? (
            <>
              <p>제작자로 로그인하면 전문 열람을 요청할 수 있습니다.</p>
              <Link href="/login" className="button">
                로그인
              </Link>
            </>
          ) : !isProducer ? (
            <>
              <p className="muted">전문 열람 요청은 영상 제작자 권한이 필요합니다.</p>
              <Link href="/account" className="button secondary">
                제작자 권한 신청
              </Link>
            </>
          ) : viewer.accessRequestStatus === null ? (
            <>
              <p>전문을 보려면 비밀유지(NDA)에 동의하고 작가에게 열람을 요청하세요.</p>
              <button onClick={() => setNdaOpen(true)}>전문 열람 요청</button>
            </>
          ) : viewer.accessRequestStatus === "PENDING" ? (
            <p>
              <StatusBadge status="PENDING" /> 작가의 승인을 기다리고 있습니다.
            </p>
          ) : viewer.accessRequestStatus === "REJECTED" ? (
            <p>
              <StatusBadge status="REJECTED" /> 작가가 열람 요청을 거절했습니다.
            </p>
          ) : (
            <>
              <p>
                <StatusBadge status="APPROVED" /> 열람이 승인되었습니다.
              </p>
              <button onClick={startNegotiation} disabled={busy}>
                작가와 협상 시작
              </button>
            </>
          )}
        </div>
        {isProducer && viewer.canReadFullText && <ReviewMessage scriptId={script.id} writerName={script.author.displayName} />}
        <div>
          <ErrorText error={error} />
        </div>
      </aside>

      {ndaOpen && (
        <Modal title="비밀유지 동의 (NDA)" onClose={() => setNdaOpen(false)}>
          <p className="small">
            이 대본의 전문과 관련 자료를 작가의 서면 동의 없이 제3자에게 공개하거나 복제·이용하지 않으며, 제작 검토 목적으로만
            사용합니다. 열람 기록은 플랫폼에 남습니다.
          </p>
          <label className="check">
            <input type="checkbox" checked={ndaChecked} onChange={(e) => setNdaChecked(e.target.checked)} />
            <span>위 내용에 동의합니다</span>
          </label>
          <div className="row">
            <button onClick={requestAccess} disabled={!ndaChecked || busy}>
              동의하고 요청
            </button>
            <button className="ghost" onClick={() => setNdaOpen(false)}>
              취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
