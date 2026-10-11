/**
 * docs/policies/likeness-policy.md의 규칙. 서비스는 규칙을 직접 계산하지 말고 이 함수들을 거친다.
 * 문서와 코드가 어긋나지 않게 하기 위해서다.
 */
export const POLICY_VERSION = 'likeness-policy-v1';

export const CONTENT_TAGS = ['ROMANCE', 'INTIMACY', 'VIOLENCE', 'HORROR', 'DEATH', 'SUBSTANCE', 'PROFANITY'] as const;
export type ContentTag = (typeof CONTENT_TAGS)[number];

export const TAKEDOWN_REASONS = [
  'OUT_OF_SCOPE',
  'PROHIBITED_CONTENT',
  'NOT_APPROVED',
  'IDENTITY_FRAUD',
  'MINOR_PROTECTION',
  'PERSONALITY_HARM',
  'PERSONAL_WITHDRAWAL',
] as const;
export type TakedownReason = (typeof TAKEDOWN_REASONS)[number];

/** 만 19세 미만은 미성년자 */
export const ADULT_AGE = 19;
/** 철회 후 취소할 수 있는 기간 (3장 2) */
export const WITHDRAW_COOLING_OFF_DAYS = 7;
/** 계약 후 새 장면을 제작할 수 있는 최대 기간 (3장 3) */
export const MAX_PRODUCTION_DAYS = 90;
/** 자동 비공개된 신고의 관리자 판단 기한 (5장) */
export const TAKEDOWN_REVIEW_DAYS = 7;
/** 조기 종료 보상 기본값: 받은 고정 출연료 반환 + 이 비율 (6장 2). 변호사 검토 전 임시값 */
export const DEFAULT_EARLY_TERMINATION_PCT = 50;

/** 미성년 출연자와 미성년 배역에 허용되지 않는 장면 유형 (4장, 7장) */
export const MINOR_FORBIDDEN_TAGS: readonly ContentTag[] = ['INTIMACY', 'SUBSTANCE'];

/** 신고 즉시 자동 비공개하는 사유 (5장). PERSONALITY_HARM, PERSONAL_WITHDRAWAL은 제외 (6장) */
export const AUTO_UNLIST_REASONS: readonly TakedownReason[] = [
  'OUT_OF_SCOPE',
  'PROHIBITED_CONTENT',
  'NOT_APPROVED',
  'IDENTITY_FRAUD',
  'MINOR_PROTECTION',
];

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** birthDate에 태어난 사람이 만 19세가 되는 날 (UTC 날짜) */
export function adultOnFrom(birthDate: Date): Date {
  return new Date(Date.UTC(birthDate.getUTCFullYear() + ADULT_AGE, birthDate.getUTCMonth(), birthDate.getUTCDate()));
}

export function isMinorAt(identity: { isMinor: boolean; adultOn: Date | null }, now: Date): boolean {
  return identity.isMinor && identity.adultOn !== null && identity.adultOn.getTime() > now.getTime();
}

/**
 * 철회 후 원본을 지우는 날: 숙려 기간 끝과 진행 중 계약의 제작 기한 중 늦은 날.
 * 철회일로부터 MAX_PRODUCTION_DAYS를 넘지 않는다.
 */
export function purgeDateFor(withdrawnAt: Date, openProductionEnds: Date[]): Date {
  const coolingOff = addDays(withdrawnAt, WITHDRAW_COOLING_OFF_DAYS);
  const cap = addDays(withdrawnAt, MAX_PRODUCTION_DAYS);
  const latest = openProductionEnds.reduce((max, d) => (d > max ? d : max), coolingOff);
  return latest > cap ? cap : latest;
}

/** required 중 allowed에 없는 태그 */
export function missingTags(required: readonly ContentTag[], allowed: readonly ContentTag[]): ContentTag[] {
  return required.filter((tag) => !allowed.includes(tag));
}

export function minorTagViolations(tags: readonly ContentTag[]): ContentTag[] {
  return tags.filter((tag) => MINOR_FORBIDDEN_TAGS.includes(tag));
}

/** 조기 종료 보상액: 받은 고정 출연료 전액 + 그 금액의 earlyTerminationPct% */
export function earlyTerminationAmount(flatFeeKrw: number, earlyTerminationPct: number) {
  const compensationKrw = Math.round((flatFeeKrw * earlyTerminationPct) / 100);
  return { refundKrw: flatFeeKrw, compensationKrw, totalKrw: flatFeeKrw + compensationKrw };
}

export const ACTIVATION_STEPS = [
  'IDENTITY',
  'FACE_SCAN',
  'LIVENESS',
  'CONSENT',
  'ADULT_RECONSENT',
  'GUARDIAN_LINK',
  'GUARDIAN_CONSENT',
  'GUARDIAN_VERIFIED',
] as const;
export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export interface ActivationInput {
  identity: { isMinor: boolean; adultOn: Date | null } | null;
  livenessVerifiedAt: Date | null;
  activeFaceScans: number;
  consentedAt: Date | null;
  consentVersion: string | null;
  guardianId: string | null;
  guardianConsentAt: Date | null;
  guardianVerifiedAt: Date | null;
}

/** 캐스팅 가능해지기까지 남은 단계. 비어 있으면 캐스팅할 수 있다 */
export function missingActivationSteps(input: ActivationInput, now: Date): ActivationStep[] {
  const missing: ActivationStep[] = [];
  if (!input.identity) missing.push('IDENTITY');
  if (input.activeFaceScans === 0) missing.push('FACE_SCAN');
  if (!input.livenessVerifiedAt) missing.push('LIVENESS');
  if (!input.consentedAt || input.consentVersion !== POLICY_VERSION) missing.push('CONSENT');
  if (input.identity) {
    if (isMinorAt(input.identity, now)) {
      if (!input.guardianId) missing.push('GUARDIAN_LINK');
      if (!input.guardianConsentAt) missing.push('GUARDIAN_CONSENT');
      if (!input.guardianVerifiedAt) missing.push('GUARDIAN_VERIFIED');
    } else if (input.identity.isMinor && input.consentedAt && input.identity.adultOn && input.consentedAt < input.identity.adultOn) {
      // 미성년자일 때 동의한 뒤 성년이 됐다: 본인이 다시 동의해야 한다 (7장)
      missing.push('ADULT_RECONSENT');
    }
  }
  return missing;
}
