import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

export type OfferStatus =
  | 'PROPOSED'
  | 'COUNTERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface OfferTerms {
  writerSharePct: number;
  producerSharePct: number;
  upfrontFeeKrw: number;
  termMonths: number;
  exclusive: boolean;
  notes?: string | null;
}

export const MAX_TERM_MONTHS = 120;
export const MAX_UPFRONT_FEE_KRW = 2_000_000_000; // Int 범위 안에서 여유 있게
export const MAX_NOTES_LENGTH = 2000;

const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v);

/** 계약: 두 비율은 0~100 정수이고 합은 100. 금액은 원 단위 정수. */
export function validateOfferTerms(t: OfferTerms): void {
  const errors: string[] = [];
  if (!isInt(t.writerSharePct) || t.writerSharePct < 0 || t.writerSharePct > 100)
    errors.push('writerSharePct는 0~100 정수여야 합니다');
  if (
    !isInt(t.producerSharePct) ||
    t.producerSharePct < 0 ||
    t.producerSharePct > 100
  )
    errors.push('producerSharePct는 0~100 정수여야 합니다');
  if (
    isInt(t.writerSharePct) &&
    isInt(t.producerSharePct) &&
    t.writerSharePct + t.producerSharePct !== 100
  )
    errors.push('writerSharePct와 producerSharePct의 합은 100이어야 합니다');
  if (
    !isInt(t.upfrontFeeKrw) ||
    t.upfrontFeeKrw < 0 ||
    t.upfrontFeeKrw > MAX_UPFRONT_FEE_KRW
  )
    errors.push(`upfrontFeeKrw는 0~${MAX_UPFRONT_FEE_KRW} 정수(원)여야 합니다`);
  if (!isInt(t.termMonths) || t.termMonths < 1 || t.termMonths > MAX_TERM_MONTHS)
    errors.push(`termMonths는 1~${MAX_TERM_MONTHS} 정수여야 합니다`);
  if (typeof t.exclusive !== 'boolean') errors.push('exclusive는 boolean이어야 합니다');
  if (t.notes != null && (typeof t.notes !== 'string' || t.notes.length > MAX_NOTES_LENGTH))
    errors.push(`notes는 ${MAX_NOTES_LENGTH}자 이하 문자열이어야 합니다`);
  if (errors.length) throw new BadRequestException(errors);
}

interface OfferRef {
  proposerId: string;
  status: OfferStatus;
}

/** 수락·거절은 상대방(제안자가 아닌 협상 참여자)만, PROPOSED 상태에서만 가능 */
export function assertCanRespond(offer: OfferRef, userId: string): void {
  if (offer.proposerId === userId)
    throw new ForbiddenException('자신이 낸 제안은 수락·거절할 수 없습니다');
  if (offer.status !== 'PROPOSED')
    throw new ConflictException(`이미 처리된 제안입니다 (${offer.status})`);
}

/** 철회는 제안자 본인만, PROPOSED 상태에서만 가능 */
export function assertCanWithdraw(offer: OfferRef, userId: string): void {
  if (offer.proposerId !== userId)
    throw new ForbiddenException('자신이 낸 제안만 철회할 수 있습니다');
  if (offer.status !== 'PROPOSED')
    throw new ConflictException(`이미 처리된 제안입니다 (${offer.status})`);
}

/**
 * 새 제안을 낼 때 기존 PROPOSED 제안의 처리:
 * - 상대방이 낸 제안 → COUNTERED (역제안)
 * - 내가 낸 제안 → WITHDRAWN (새 제안으로 대체)
 */
export function supersededStatus(
  previous: OfferRef,
  newProposerId: string,
): Extract<OfferStatus, 'COUNTERED' | 'WITHDRAWN'> {
  return previous.proposerId === newProposerId ? 'WITHDRAWN' : 'COUNTERED';
}

/** 딜 생성 시 License.scope에 기록할 조건 요약 */
export function buildLicenseScope(t: OfferTerms): string {
  const fee = t.upfrontFeeKrw.toLocaleString('ko-KR');
  return [
    `영상화 권리 ${t.exclusive ? '독점' : '비독점'} 이용`,
    `기간 ${t.termMonths}개월`,
    `수익 분배 작가 ${t.writerSharePct}% / 제작자 ${t.producerSharePct}%`,
    `선급금 ${fee}원`,
    t.notes ? `비고: ${t.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
