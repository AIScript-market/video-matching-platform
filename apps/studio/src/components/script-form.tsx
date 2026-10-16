"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ScriptFileUpload } from "@/components/file-upload";
import { ErrorText, StatusBadge } from "@/components/ui";
import { api, unwrap, uploadScriptFile, type ScriptDetail } from "@/lib/api";
import { useSession } from "@/lib/session";

const EMPTY = { title: "", logline: "", synopsis: "", genre: "드라마", fullText: "", previewText: "" };

/** 작가가 먼저 궁금한 것부터: 🔒 대본이 새어 나가는가, ⭐ 나에게 좋은 점. 어디에 어떻게 쓰이는지는 "자세히 보기"에 */
interface ConsentPoint {
  kind: "safe" | "benefit" | "why";
  text: React.ReactNode;
}
const POINT_ICON: Record<ConsentPoint["kind"], string> = { safe: "🔒", benefit: "⭐", why: "💡" };

/** 동의 항목 하나: 체크박스, 안심·혜택 몇 줄, 그 아래 펼쳐 보는 자세한 내용 (펼쳐도 체크되지 않게 label 밖에 둔다) */
function ConsentItem({
  checked,
  disabled,
  onChange,
  required,
  label,
  points,
  detailsLabel,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  label: string;
  points: ConsentPoint[];
  detailsLabel: string;
  children: React.ReactNode;
}) {
  const pointsId = useId();
  return (
    <div className="consent">
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={pointsId} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <strong>{label}</strong> <span className={required ? "badge" : "badge muted"}>{required ? "필수" : "선택"}</span>
        </span>
      </label>
      <ul id={pointsId} className="consent-points small">
        {points.map((p, i) => (
          <li key={i} className={p.kind === "safe" ? "safe" : undefined}>
            <span aria-hidden="true">{POINT_ICON[p.kind]}</span> {p.text}
          </li>
        ))}
      </ul>
      <details className="consent-details">
        <summary>자세히 보기 · {detailsLabel}</summary>
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
  // 흥행 예측이 켜져 있을 때만(베타에서는 꺼짐) 예측 결과가 보인다는 안내를 덧붙인다
  const predictionsOn = Boolean(config?.features.hitModel);
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
  const consents = { rightsDeclared: rights, trainingConsent };
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
        <p className="small muted" style={{ margin: 0 }}>
          로그라인과 시놉시스는 누구나 보는 소개입니다. 대본 목록에 함께 보일 짧은 AI 요약과 태그도 이 글로만 만듭니다 (대본 전문은 쓰지 않습니다).
        </p>
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
          points={[{ kind: "why", text: "제작자가 안심하고 계약할 수 있도록, 공개 전에 한 번 받는 확인입니다." }]}
          detailsLabel="어떤 경우를 확인하나요?"
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
          checked={trainingConsent}
          onChange={setTrainingConsent}
          label="대본 분석 프로그램에 참여하기"
          points={[
            { kind: "safe", text: "대본 전문은 플랫폼 밖으로 보내지 않고, 다른 이용자에게도 보이지 않습니다. 분석에는 대본을 숫자로 바꾼 값만 씁니다." },
            { kind: "benefit", text: "대본 피드백 기능이 열리면, 참여한 작가님께 먼저 피드백을 드립니다." },
          ]}
          detailsLabel="어떻게 분석하나요?"
        >
          <ul>
            <li>대본은 플랫폼 서버 안에서 장면별 숫자(벡터)로 바뀌고, 이 숫자도 서버 안에만 둡니다.</li>
            <li>이 숫자와 플랫폼 채널에 올라간 영상의 성과(조회수 등)를 함께 보며, 어떤 대본이 시청자에게 통하는지 배우는 데 씁니다. 그 결과로 작가님께 드릴 피드백과 흥행 예측을 만듭니다.</li>
            <li>대본 원문과 숫자 모두 외부 AI 서비스나 다른 회사에 보내거나 팔지 않습니다.</li>
            {predictionsOn && <li>참여하지 않아도, 공개한 대본에는 제작자에게 흥행 예측과 추천 결과가 보일 수 있습니다.</li>}
            <li>언제든 끌 수 있고, 끄면 다음 분석부터 빠집니다.</li>
          </ul>
        </ConsentItem>
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
