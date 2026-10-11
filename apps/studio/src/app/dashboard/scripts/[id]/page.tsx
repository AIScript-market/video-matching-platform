"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { ScriptForm } from "@/components/script-form";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, unwrap, type ScriptDetail } from "@/lib/api";

export default function EditScriptPage() {
  return (
    <RequireAuth role="WRITER">
      <EditScript />
    </RequireAuth>
  );
}

function EditScript() {
  const { id } = useParams<{ id: string }>();
  // 처음 불러온 값으로 폼을 만들고, 이후 최신 상태(요약 진행·수정 시각)는 latest로 따로 갱신한다
  const [initial, setInitial] = useState<ScriptDetail | null>(null);
  const [latest, setLatest] = useState<ScriptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      unwrap(api.GET("/scripts/{id}", { params: { path: { id } } }))
        .then((s) => {
          setInitial((prev) => prev ?? s);
          setLatest(s);
        })
        .catch((err: Error) => setError(err.message)),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 요약을 만드는 중이면 끝날 때까지 3초마다 상태만 다시 불러온다 (폼 입력은 건드리지 않음)
  useEffect(() => {
    if (!latest?.aiSummaryPending) return;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [latest, load]);

  if (error) return <ErrorText error={error} />;
  if (!initial || !latest) return <p className="muted">불러오는 중…</p>;
  if (!initial.viewer.isAuthor) return <p className="error">작가 본인만 편집할 수 있습니다.</p>;
  return (
    <div className="stack">
      <ScriptForm key={initial.id} script={initial} onSaved={setLatest} />
      <AiSummaryCard script={latest} onUpdated={setLatest} />
    </div>
  );
}
