"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/scripts/{id}", { params: { path: { id } } }))
      .then(setScript)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!script) return <p className="muted">불러오는 중…</p>;
  if (!script.viewer.isAuthor) return <p className="error">작가 본인만 편집할 수 있습니다.</p>;
  return <ScriptForm key={script.updatedAt} script={script} />;
}
