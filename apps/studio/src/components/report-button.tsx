"use client";

import { useState } from "react";
import { ErrorText, Modal } from "@/components/ui";
import { api, unwrap, type Schemas } from "@/lib/api";
import { useSession } from "@/lib/session";

type Reason = Schemas["CreateReportDto"]["reason"];

export const REPORT_REASON_LABEL: Record<Reason, string> = {
  SPAM: "스팸·홍보",
  ABUSE: "욕설·괴롭힘",
  FRAUD: "사기·금전 요구",
  COPYRIGHT: "저작권 침해 (타인의 대본 등)",
  INAPPROPRIATE: "부적절한 콘텐츠",
  OTHER: "기타",
};

/**
 * 계정 신고 버튼. 로그인했고 자기 자신이 아닐 때만 보인다.
 * scriptId를 주면 어느 대본에서 신고했는지 함께 남긴다.
 */
export function ReportButton({
  targetId,
  targetName,
  scriptId,
  className = "ghost",
}: {
  targetId: string;
  targetName: string;
  scriptId?: string;
  className?: string;
}) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("SPAM");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user || user.id === targetId || user.roles.includes("ADMIN")) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(
        api.POST("/users/{id}/reports", {
          params: { path: { id: targetId } },
          body: { reason, ...(details.trim() ? { details: details.trim() } : {}), ...(scriptId ? { scriptId } : {}) },
        }),
      );
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
    setDetails("");
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        🚩 신고
      </button>
      {open && (
        <Modal title={`${targetName} 계정 신고`} onClose={close}>
          {done ? (
            <div className="stack">
              <p className="notice">신고가 접수되었습니다. 관리자가 확인한 뒤 조치합니다.</p>
              <button type="button" onClick={close}>
                닫기
              </button>
            </div>
          ) : (
            <form className="stack" onSubmit={submit} aria-label="계정 신고">
              <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                  신고 사유
                </legend>
                {(Object.keys(REPORT_REASON_LABEL) as Reason[]).map((r) => (
                  <label key={r} className="check">
                    <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                    <span>{REPORT_REASON_LABEL[r]}</span>
                  </label>
                ))}
              </fieldset>
              <label>
                내용 {reason === "OTHER" ? "(필수)" : "(선택)"}
                <textarea
                  maxLength={2000}
                  required={reason === "OTHER"}
                  placeholder="무슨 일이 있었는지 구체적으로 적어 주세요"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
              <p className="small muted">허위 신고는 제재 대상이 될 수 있습니다. 신고한 사실은 상대에게 알리지 않습니다.</p>
              <ErrorText error={error} />
              <div className="row">
                <button type="submit" className="danger" disabled={busy}>
                  신고하기
                </button>
                <button type="button" className="ghost" onClick={close}>
                  취소
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
