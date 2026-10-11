"use client";

import { useRef, useState } from "react";
import { ErrorText } from "@/components/ui";
import { UPLOAD_ACCEPT, type ScriptDetail } from "@/lib/api";

/** 대본 파일을 골라 바로 올리는 버튼. 성공하면 서버가 돌려준 대본을 넘긴다 */
export function ScriptFileUpload({
  label,
  upload,
  onDone,
}: {
  label: string;
  upload: (file: File) => Promise<ScriptDetail>;
  onDone: (script: ScriptDetail) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await upload(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "올리는 중…" : label}
        </button>
        <span className="small muted">.txt .md .fountain .docx .pdf · 최대 5MB</span>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={onChange}
          aria-label={label}
          style={{ display: "none" }}
        />
      </div>
      <ErrorText error={error} />
    </div>
  );
}
