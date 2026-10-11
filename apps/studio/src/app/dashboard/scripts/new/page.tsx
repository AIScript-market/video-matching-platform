"use client";

import { ScriptForm } from "@/components/script-form";
import { RequireAuth } from "@/components/ui";

export default function NewScriptPage() {
  return (
    <RequireAuth role="WRITER">
      <ScriptForm />
    </RequireAuth>
  );
}
