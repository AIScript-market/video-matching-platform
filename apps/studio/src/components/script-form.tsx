"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScriptFileUpload } from "@/components/file-upload";
import { ErrorText, StatusBadge } from "@/components/ui";
import { api, unwrap, uploadScriptFile, type ScriptDetail } from "@/lib/api";

const EMPTY = { title: "", logline: "", synopsis: "", genre: "드라마", fullText: "" };

/** 새 대본 작성과 기존 대본 수정·공개에 같이 쓴다 */
export function ScriptForm({ script }: { script?: ScriptDetail }) {
  const router = useRouter();
  const [form, setForm] = useState(
    script
      ? { title: script.title, logline: script.logline, synopsis: script.synopsis, genre: script.genre, fullText: script.fullText ?? "" }
      : EMPTY,
  );
  const [rights, setRights] = useState(script?.rightsDeclared ?? false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (script) {
        await unwrap(api.PATCH("/scripts/{id}", { params: { path: { id: script.id } }, body: { ...form, rightsDeclared: rights } }));
        setNotice("저장했습니다.");
        router.refresh();
      } else {
        const created = await unwrap(api.POST("/scripts", { body: { ...form, rightsDeclared: rights } }));
        router.push(`/dashboard/scripts/${created.id}`);
      }
    });

  const publish = () =>
    run(async () => {
      if (!script) return;
      await unwrap(api.PATCH("/scripts/{id}", { params: { path: { id: script.id } }, body: form }));
      await unwrap(api.POST("/scripts/{id}/publish", { params: { path: { id: script.id } }, body: { rightsDeclared: rights } }));
      router.push(`/scripts/${script.id}`);
    });

  const locked = script?.status === "PUBLISHED";
  const lines = form.fullText ? form.fullText.split("\n").length : 0;
  const scenes = (form.fullText.match(/^S#\d+/gm) ?? []).length;

  /** 다음 장면 번호로 "S#n. 장소 (시간)" 머리글을 본문 끝에 붙인다 */
  const addScene = () =>
    setForm((f) => ({
      ...f,
      fullText: `${f.fullText.trimEnd()}${f.fullText.trim() ? "\n\n" : ""}S#${scenes + 1}. 장소 (시간)\n\n`,
    }));

  return (
    <form className="stack" onSubmit={(e) => (e.preventDefault(), save())}>
      <div className="spread">
        <h1>{script ? "대본 편집" : "새 대본"}</h1>
        {script && <StatusBadge status={script.status} />}
      </div>
      {script?.status === "HIDDEN" && <p className="notice">관리자가 숨긴 대본입니다. 수정은 가능하지만 다시 공개할 수 없습니다.</p>}
      <div className="card stack">
        <label>
          제목
          <input required maxLength={120} value={form.title} onChange={set("title")} />
        </label>
        <div className="row" style={{ alignItems: "stretch" }}>
          <label style={{ flex: "1 1 160px" }}>
            장르
            <input required maxLength={40} value={form.genre} onChange={set("genre")} list="genres" />
            <datalist id="genres">
              {["미스터리", "드라마", "SF", "스릴러", "코미디", "로맨스", "공포", "액션"].map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label style={{ flex: "3 1 320px" }}>
            로그라인 (한 줄 소개)
            <input required maxLength={300} value={form.logline} onChange={set("logline")} />
          </label>
        </div>
        <label>
          시놉시스 (공개)
          <textarea required maxLength={5000} value={form.synopsis} onChange={set("synopsis")} />
        </label>
        <label>
          대본 전문 (작가와 열람 승인된 제작자만 볼 수 있음)
          <textarea required value={form.fullText} onChange={set("fullText")} style={{ minHeight: 320, fontFamily: "ui-monospace, monospace" }} />
        </label>
        <div className="spread small muted">
          <span>
            {form.fullText.length.toLocaleString("ko-KR")}자 · {lines.toLocaleString("ko-KR")}줄 · 장면 {scenes}개
          </span>
          <button type="button" className="ghost" onClick={addScene}>
            + 장면 머리글 추가
          </button>
        </div>
        {script && (
          <ScriptFileUpload
            label="파일로 본문 바꾸기"
            upload={(file) => uploadScriptFile(`/scripts/${script.id}/upload`, file)}
            onDone={(updated) => {
              setForm((f) => ({ ...f, fullText: updated.fullText ?? "" }));
              setNotice("파일 내용으로 본문을 바꿨습니다.");
            }}
          />
        )}
        <label className="check">
          <input type="checkbox" checked={rights} disabled={locked && rights} onChange={(e) => setRights(e.target.checked)} />
          <span>
            이 대본의 저작권 등 영상화에 필요한 권리를 본인이 보유하고 있으며, 타인의 권리를 침해하지 않음을 진술합니다.
            <span className="muted small"> (공개하려면 필수)</span>
          </span>
        </label>
      </div>
      <ErrorText error={error} />
      {notice && <p className="notice">{notice}</p>}
      <div className="row">
        <button type="submit" className={script ? "secondary" : undefined} disabled={busy}>
          {script ? "저장" : "임시 저장"}
        </button>
        {script && script.status === "DRAFT" && (
          <button type="button" onClick={publish} disabled={busy || !rights}>
            공개하기
          </button>
        )}
      </div>
    </form>
  );
}
