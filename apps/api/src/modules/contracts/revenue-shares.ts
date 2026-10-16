import { BadRequestException } from '@nestjs/common';

/**
 * 다자 수익 배분 규칙 (대본 이용허락 계약 v1, docs/business-model.md).
 * 배분율은 만분율(basis point, 10000 = 100%)로 둔다. 작가·제작자 둘뿐 아니라 공동 작가, 공동 제작자, 나중에 출연자까지 같은 규칙으로 나눈다.
 * 플랫폼은 당사자이지만 영상 광고 수익의 몫은 언제나 0이다 (채널 게시 계약 제3조).
 */
export const FULL_SHARE_BP = 10_000;
export const MAX_REVENUE_PARTIES = 20;

export type ShareRole = 'WRITER' | 'PRODUCER' | 'PLATFORM' | 'PERFORMER' | 'OTHER';

export interface PartyShare {
  /** 당사자를 구분하는 값 (ContractParty.id 등) */
  key: string;
  role: ShareRole;
  /** 배분율(만분율). 배분받지 않는 당사자는 null */
  revenueShareBp: number | null;
  /** 내림으로 남는 원 단위를 받는 당사자 (정확히 하나) */
  receivesRemainder: boolean;
}

/** 배분표 검사: 합 100%, 나머지 받는 당사자 하나, 플랫폼 몫 없음, 작가와 제작자는 반드시 포함 */
export function validateShares(parties: PartyShare[]): void {
  const errors: string[] = [];
  if (parties.length > MAX_REVENUE_PARTIES) errors.push(`당사자는 ${MAX_REVENUE_PARTIES}명까지입니다`);
  const sharing = parties.filter((p) => p.revenueShareBp !== null);
  for (const p of sharing) {
    if (!Number.isInteger(p.revenueShareBp) || p.revenueShareBp! < 0 || p.revenueShareBp! > FULL_SHARE_BP) {
      errors.push('배분율은 0~100% 사이여야 합니다 (만분율 정수)');
      break;
    }
  }
  const total = sharing.reduce((a, p) => a + (p.revenueShareBp ?? 0), 0);
  if (total !== FULL_SHARE_BP) errors.push(`배분율의 합은 100%여야 합니다 (지금 ${(total / 100).toFixed(2)}%)`);
  if (parties.some((p) => p.role === 'PLATFORM' && (p.revenueShareBp ?? 0) !== 0)) errors.push('플랫폼은 영상 광고 수익을 배분받지 않습니다');
  const remainder = parties.filter((p) => p.receivesRemainder);
  if (remainder.length !== 1) errors.push('내림 차이를 받는 당사자는 정확히 한 명이어야 합니다');
  else if (remainder[0].revenueShareBp === null) errors.push('내림 차이를 받는 당사자는 배분율이 있어야 합니다');
  if (!parties.some((p) => p.role === 'WRITER')) errors.push('작가가 당사자에 있어야 합니다');
  if (!parties.some((p) => p.role === 'PRODUCER')) errors.push('제작자가 당사자에 있어야 합니다');
  if (errors.length) throw new BadRequestException(errors);
}

/**
 * 확정 수익을 배분율대로 나눈다. 당사자마다 내림하고, 모자란 원 단위는 나머지 받는 당사자에게 준다.
 * 반환: key → 원
 */
export function splitAmong(amountKrw: number, parties: PartyShare[]): Map<string, number> {
  if (!Number.isInteger(amountKrw) || amountKrw < 0) throw new BadRequestException('확정 수익은 0 이상의 원 단위 정수여야 합니다');
  validateShares(parties);
  const out = new Map<string, number>();
  let given = 0;
  for (const p of parties) {
    if (p.revenueShareBp === null) continue;
    const v = Math.floor((amountKrw * p.revenueShareBp) / FULL_SHARE_BP);
    out.set(p.key, v);
    given += v;
  }
  const r = parties.find((p) => p.receivesRemainder)!;
  out.set(r.key, (out.get(r.key) ?? 0) + (amountKrw - given));
  return out;
}

/** 두 사람 계약(작가 %·제작자 %)을 배분표로 바꾼다. 나머지는 제작자 */
export function twoPartyShares(writerSharePct: number, producerSharePct: number, keys = { writer: 'WRITER', producer: 'PRODUCER' }): PartyShare[] {
  return [
    { key: keys.writer, role: 'WRITER', revenueShareBp: writerSharePct * 100, receivesRemainder: false },
    { key: keys.producer, role: 'PRODUCER', revenueShareBp: producerSharePct * 100, receivesRemainder: true },
  ];
}

export const formatBp = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
