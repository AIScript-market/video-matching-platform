import type { Schemas } from "./api";
import { won } from "./api";

export type TalentSelf = Schemas["TalentSelfDto"];
export type TalentPublic = Schemas["TalentPublicDto"];
export type Identity = Schemas["IdentityDto"];
export type AccessLogEntry = Schemas["AccessLogEntryDto"];
export type Ward = Schemas["WardDto"];
export type Project = Schemas["ProjectDto"];
export type CastingRole = Schemas["RoleDto"];
export type CastingNegotiation = Schemas["CastingNegotiationDto"];
export type CastingOffer = Schemas["CastingOfferDto"];
export type CastingContract = Schemas["CastingContractDto"];
export type Work = Schemas["WorkDto"];
export type Takedown = Schemas["TakedownDto"];
export type ContentTag = TalentSelf["allowedTags"][number];
export type FeeType = CastingOffer["feeType"];
export type UsageScope = CastingOffer["usage"];
export type TakedownReason = Takedown["reason"];

/** 정책 문서(docs/policies/likeness-policy.md)와 같은 순서·설명 */
export const CONTENT_TAGS: { tag: ContentTag; label: string; hint: string; minor: "ok" | "no" }[] = [
  { tag: "ROMANCE", label: "로맨스", hint: "연애 감정 묘사 (신체 접촉 없음)", minor: "ok" },
  { tag: "INTIMACY", label: "신체 접촉", hint: "키스, 베드신 등 (노출 없음)", minor: "no" },
  { tag: "VIOLENCE", label: "폭력", hint: "폭력 묘사", minor: "ok" },
  { tag: "HORROR", label: "공포", hint: "공포 연출", minor: "ok" },
  { tag: "DEATH", label: "죽음", hint: "사망·시신 연기", minor: "ok" },
  { tag: "SUBSTANCE", label: "음주·흡연·약물", hint: "음주·흡연·약물", minor: "no" },
  { tag: "PROFANITY", label: "욕설", hint: "욕설", minor: "ok" },
];
export const TAG_LABEL = Object.fromEntries(CONTENT_TAGS.map((t) => [t.tag, t.label])) as Record<ContentTag, string>;

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  FLAT: "고정 출연료",
  PER_EPISODE: "회당 출연료",
  REVENUE_SHARE: "수익 배분",
  HYBRID: "고정 + 수익 배분",
};

export const USAGE_LABEL: Record<UsageScope, string> = {
  DIGITAL: "디지털 출연",
  LIVE: "실제 촬영",
  BOTH: "디지털 + 실제 촬영",
};

export const STEP_LABEL: Record<TalentSelf["missingSteps"][number], string> = {
  IDENTITY: "본인인증",
  FACE_SCAN: "얼굴 스캔 업로드",
  LIVENESS: "실시간 셀카 확인",
  CONSENT: "민감정보 처리 동의",
  ADULT_RECONSENT: "성년이 된 뒤 다시 동의",
  GUARDIAN_LINK: "보호자 계정 연결",
  GUARDIAN_CONSENT: "보호자 동의",
  GUARDIAN_VERIFIED: "보호자 관계 확인 (운영팀)",
};

export const TAKEDOWN_REASONS: { reason: TakedownReason; label: string; immediate: boolean }[] = [
  { reason: "OUT_OF_SCOPE", label: "계약에 없는 장면·용도 (예: 합의하지 않은 베드신)", immediate: true },
  { reason: "PROHIBITED_CONTENT", label: "금지 용도 (노출·성적, 정치, 사칭 등)", immediate: true },
  { reason: "NOT_APPROVED", label: "출연분 확인 없이 공개됨", immediate: true },
  { reason: "IDENTITY_FRAUD", label: "내가 등록하지 않은 얼굴 (신원 도용)", immediate: true },
  { reason: "MINOR_PROTECTION", label: "미성년자 보호 기준 위반", immediate: true },
  { reason: "PERSONALITY_HARM", label: "명예를 심각하게 해치는 맥락으로 쓰임", immediate: false },
  { reason: "PERSONAL_WITHDRAWAL", label: "개인 사정으로 내리고 싶음", immediate: false },
];
export const TAKEDOWN_LABEL = Object.fromEntries(TAKEDOWN_REASONS.map((r) => [r.reason, r.label])) as Record<TakedownReason, string>;

/** 출연료 조건 한 줄 요약 */
export function feeSummary(o: Pick<CastingOffer, "feeType" | "flatFeeKrw" | "perEpisodeFeeKrw" | "episodes" | "revenueSharePct">): string {
  switch (o.feeType) {
    case "FLAT":
      return `고정 ${won(o.flatFeeKrw)}`;
    case "PER_EPISODE":
      return `회당 ${won(o.perEpisodeFeeKrw)} × ${o.episodes ?? 0}회`;
    case "REVENUE_SHARE":
      return `순수익의 ${o.revenueSharePct}%`;
    case "HYBRID":
      return `고정 ${won(o.flatFeeKrw)} + 순수익의 ${o.revenueSharePct}%`;
  }
}

export const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { dateStyle: "medium" });

/** multipart 업로드 (얼굴 스캔, 셀카) */
export async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", body: form, credentials: "include" });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = (body as { message?: string | string[] } | undefined)?.message;
    throw new Error(Array.isArray(message) ? message.join("\n") : (message ?? "업로드하지 못했습니다"));
  }
  return body as T;
}
