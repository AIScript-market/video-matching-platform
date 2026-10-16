"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ScriptFileUpload } from "@/components/file-upload";
import { ErrorText, StatusBadge } from "@/components/ui";
import { api, unwrap, uploadScriptFile, type ScriptDetail } from "@/lib/api";
import { useSession } from "@/lib/session";

const EMPTY = { title: "", logline: "", synopsis: "", genre: "드라마", fullText: "", previewText: "" };

/** 동의 항목 하나: 체크박스와 한 줄 설명, 그 아래 펼쳐 보는 자세한 내용 (펼쳐도 체크되지 않게 label 밖에 둔다) */
function ConsentItem({
  checked,
  disabled,
  onChange,
  required,
  label,
  hint,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const hintId = useId();
  return (
    <div className="consent">
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={hintId} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <strong>{label}</strong> <span className={required ? "badge" : "badge muted"}>{required ? "필수" : "선택"}</span>
        </span>
      </label>
      <p id={hintId} className="small muted consent-hint">
        {hint}
      </p>
      <details className="consent-details">
        <summary>자세히 보기</summary>
        <div className="small">{children}</div>
      </details>
    </div>
  );
}
const PREVIEW_MAX = 50_000;

/**
 * 새 대본 작성과 기존 대본 수정·공개에 같이 쓴다.
 * 폼 값은 처음 받은 script로만 초기화하고, 이후 서버 상태(요약 진행 등)는 onSaved로 부모에 알린다.
 */
export function ScriptForm({ script, onSaved }: { script?: ScriptDetail; onSaved?: (s: ScriptDetail) => void }) {
  const router = useRouter();
  const { refresh, config } = useSession();
  const trainingOn = Boolean(config?.features.hitModel);
  const [form, setForm] = useState(
    script
      ? {
          title: script.title,
          logline: script.logline,
          synopsis: script.synopsis,
          genre: script.genre,
          fullText: script.fullText ?? "",
          previewText: script.previewText ?? "",
        }
      : EMPTY,
  );
  const [rights, setRights] = useState(script?.rightsDeclared ?? false);
  const [trainingConsent, setTrainingConsent] = useState(script?.trainingConsent ?? false);
  // 공개 소개 글만 요약하므로 새 대본은 켜 두고, 작가가 끌 수 있게 한다
  const [aiSummaryConsent, setAiSummaryConsent] = useState(script?.aiSummaryConsent ?? true);
  // 흥행 예측 기능이 꺼져 있으면(베타) 학습 동의는 묻지도 보내지도 않는다
  const consents = { rightsDeclared: rights, aiSummaryConsent, ...(trainingOn && { trainingConsent }) };
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
        const saved = await unwrap(
          api.PATCH("/scripts/{id}", { params: { path: { id: script.id } }, body: { ...form, ...consents } }),
        );
        setNotice(saved.aiSummaryPending ? "저장했습니다. 바뀐 시놉시스로 AI 요약을 만들고 있습니다." : "저장했습니다.");
        onSaved?.(saved);
      } else {
        const created = await unwrap(api.POST("/scripts", { body: { ...form, ...consents } }));
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
            label="파일로 본문 바꾸기 (5코인)"
            upload={(file) => uploadScriptFile(`/scripts/${script.id}/upload`, file)}
            onDone={(updated) => {
              setForm((f) => ({ ...f, fullText: updated.fullText ?? "" }));
              setNotice("파일 내용으로 본문을 바꿨습니다.");
              onSaved?.(updated);
              void refresh();
            }}
          />
        )}
      </div>

      <div className="card stack" aria-label="미리보기 대본 편집">
        <h2 style={{ margin: 0 }}>미리보기 대본 (선택)</h2>
        <p className="small muted">
          전문 대신 <strong>먼저 보여줄 일부분</strong>입니다. 대본을 공개하면 다른 사용자가 코인(3코인)으로 열람권을 사서 볼 수 있습니다. 비워 두면 미리보기가 없습니다.
        </p>
        <label>
          미리보기 본문
          <textarea
            value={form.previewText}
            maxLength={PREVIEW_MAX}
            onChange={set("previewText")}
            placeholder="예: S#1~S#3 또는 핵심 장면 한두 개"
            style={{ minHeight: 160, fontFamily: "ui-monospace, monospace" }}
          />
        </label>
        <div className="spread small muted">
          <span>
            {form.previewText.length.toLocaleString("ko-KR")}자
            {form.fullText.length > 0 && ` · 전문의 ${Math.round((form.previewText.length / form.fullText.length) * 100)}%`}
          </span>
          {form.previewText && (
            <button type="button" className="ghost" onClick={() => setForm((f) => ({ ...f, previewText: "" }))}>
              미리보기 비우기
            </button>
          )}
        </div>
        {script && (
          <ScriptFileUpload
            label="미리보기 파일 올리기 (5코인)"
            upload={(file) => uploadScriptFile(`/scripts/${script.id}/preview/upload`, file)}
            onDone={(updated) => {
              setForm((f) => ({ ...f, previewText: updated.previewText ?? "" }));
              setNotice("파일 내용으로 미리보기 대본을 바꿨습니다.");
              onSaved?.(updated);
              void refresh();
            }}
          />
        )}
      </div>

      <section className="card stack" aria-label="확인과 동의">
        <h2 style={{ margin: 0 }}>확인과 동의</h2>
        <ConsentItem
          required
          checked={rights}
          disabled={locked && rights}
          onChange={setRights}
          label="이 대본을 영상으로 만들도록 허락할 권리가 저에게 있습니다"
          hint="대본을 공개하려면 확인해 주세요. 제작자가 안심하고 계약할 수 있도록 받는 확인입니다."
        >
          <p>내 대본이라도 아래 경우에는 다른 사람의 허락이 필요할 수 있어서 함께 확인합니다.</p>
          <ul>
            <li>함께 쓴 작가가 있다면, 공동 작가 모두에게 이 플랫폼에 올리고 계약해도 된다는 동의를 받았습니다.</li>
            <li>웹소설·웹툰·소설·실화 기록 같은 원작이 있다면, 원작자에게 영상화 허락을 받았습니다.</li>
            <li>다른 회사에 이 대본의 영상화 권리를 넘기거나 독점 계약을 맺은 적이 없습니다 (있었다면 이미 끝났습니다).</li>
            <li>실존 인물이나 단체를 다룬다면, 명예나 사생활을 침해하지 않도록 살폈습니다.</li>
          </ul>
          <p>
            확인한 시각이 기록됩니다. 사실과 다르면 계약한 제작자에게 손해를 배상해야 할 수 있습니다. 공개한 뒤에는 이 확인을 거둘 수 없습니다. 자세한 내용은{" "}
            <a href="/terms" target="_blank" rel="noreferrer">
              이용약관
            </a>
            에 있습니다.
          </p>
        </ConsentItem>
        <ConsentItem
          checked={aiSummaryConsent}
          onChange={setAiSummaryConsent}
          label="시놉시스로 AI 요약 만들기"
          hint="제작자가 대본을 빨리 고를 수 있도록 로그라인·시놉시스로 짧은 요약과 태그, 예상 등급을 만들어 목록에 보여 줍니다. 대본 전문은 쓰지 않습니다."
        >
          <ul>
            <li>
              AI에 보내는 것은 <strong>제목·장르·로그라인·시놉시스</strong>뿐입니다. 이 글들은 원래 누구나 보는 공개 소개라서, 요약도 시놉시스처럼 누구나 봅니다.
            </li>
            <li>대본 전문과 미리보기 대본은 AI로 보내지 않습니다. 전문은 지금처럼 비밀유지 서약 후 작가님이 승인한 제작자만 봅니다.</li>
            <li>요약을 만드는 곳은 Google의 AI 서비스(Gemini API, 미국)입니다. 플랫폼은 유료 API를 쓰므로 Google은 보낸 내용을 AI 학습 등 자기 제품 개선에 쓰지 않습니다. 다만 악용 방지와 법적 의무를 위해 일정 기간 보관할 수 있습니다.</li>
            <li>시놉시스를 고치면 요약을 새로 만듭니다. 마음에 들지 않으면 언제든 끌 수 있고, 끄면 만든 요약을 지웁니다.</li>
          </ul>
        </ConsentItem>
        {trainingOn && (
          <ConsentItem
            checked={trainingConsent}
            onChange={setTrainingConsent}
            label="흥행 예측 기능 개선에 참여하기"
            hint="이 대본과 영상 성과를 플랫폼의 흥행 예측을 더 정확하게 만드는 데 씁니다."
          >
            <ul>
              <li>대본은 플랫폼 안에서 장면별 숫자(벡터)로 바뀌고, 개선에는 이 숫자와 영상 성과만 씁니다. 원문은 밖으로 보내지 않습니다.</li>
              <li>참여하지 않아도 공개한 대본에는 제작자에게 흥행 예측과 추천 결과가 보일 수 있습니다.</li>
              <li>언제든 끌 수 있고, 끄면 다음 개선부터 빠집니다.</li>
            </ul>
          </ConsentItem>
        )}
      </section>
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
