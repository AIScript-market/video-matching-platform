"use client";

import { useRouter } from "next/navigation";
import { ScriptFileUpload } from "@/components/file-upload";
import { ScriptForm } from "@/components/script-form";
import { RequireCreator } from "@/components/ui";
import { uploadScriptFile } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function NewScriptPage() {
  const router = useRouter();
  const { refresh } = useSession();
  return (
    <RequireCreator>
      <div className="stack">
        <section className="card stack" aria-label="파일로 시작하기">
          <h2>파일로 시작하기</h2>
          <p className="small muted">
            이미 써 둔 대본 파일을 올리면 본문을 추출해 초안을 만듭니다. 제목은 파일 이름으로 정해지고, 로그라인·시놉시스·장르를 채운 뒤 공개할 수 있습니다.
          </p>
          <ScriptFileUpload
            label="대본 파일 올리기 (5코인)"
            upload={(file) => uploadScriptFile("/scripts/upload", file)}
            onDone={(script) => {
              void refresh();
              router.push(`/dashboard/scripts/${script.id}`);
            }}
          />
        </section>
        <p className="muted small" style={{ textAlign: "center" }}>
          또는 직접 작성하기
        </p>
        <ScriptForm />
      </div>
    </RequireCreator>
  );
}
