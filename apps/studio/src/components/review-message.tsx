"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/session";

/** 전문을 검토한 제작자가 작가에게 바로 메시지를 보내는 패널. 협상 대화로 이어진다 */
export function ReviewMessage({ scriptId, writerName }: { scriptId: string; writerName: string }) {
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useSession();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await unwrap(
        api.POST("/scripts/{id}/contact", { params: { path: { id: scriptId } }, body: { body } }),
      );
      setBody("");
      setSent(result.negotiationId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={send} aria-label="검토 후 메시지">
      <h2>검토 후 작가에게 메시지</h2>
      <p className="small muted">
        {writerName} 작가에게 검토 의견이나 궁금한 점을 보내세요. 메시지 1건에 1코인이 듭니다. 대화는 협상방에 이어지고, 운영을 위해 관리자가 기록을 볼 수 있습니다.
      </p>
      <textarea
        aria-label="검토 메시지"
        required
        maxLength={2000}
        placeholder="예: 2화 전개가 인상적입니다. 영상화 방향을 이야기 나누고 싶어요."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <ErrorText error={error} />
      {sent && (
        <p className="notice small">
          메시지를 보냈습니다. <Link href={`/negotiations/${sent}`}>대화 이어가기 →</Link>
        </p>
      )}
      <button type="submit" disabled={busy || !body.trim()}>
        메시지 보내기 (1코인)
      </button>
    </form>
  );
}
