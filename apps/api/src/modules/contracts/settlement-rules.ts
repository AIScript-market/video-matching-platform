import { BadRequestException } from '@nestjs/common';

/**
 * 영상 광고 수익 정산 규칙 (채널 게시 계약 제3·4조).
 * 확정 수익은 전액 제작 측에 나눈다: 작가 몫은 배분율로 내림하고, 남는 원 단위는 제작자에게 간다. 플랫폼 몫은 0.
 */
export interface RevenueSplit {
  writerKrw: number;
  producerKrw: number;
  platformKrw: 0;
}

export function splitRevenue(amountKrw: number, writerSharePct: number): RevenueSplit {
  if (!Number.isInteger(amountKrw) || amountKrw < 0) throw new BadRequestException('확정 수익은 0 이상의 원 단위 정수여야 합니다');
  if (!Number.isInteger(writerSharePct) || writerSharePct < 0 || writerSharePct > 100) {
    throw new BadRequestException('작가 배분율은 0~100 정수여야 합니다');
  }
  const writerKrw = Math.floor((amountKrw * writerSharePct) / 100);
  return { writerKrw, producerKrw: amountKrw - writerKrw, platformKrw: 0 };
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 정산 월은 YYYY-MM. 아직 끝나지 않은 달의 수익은 확정되지 않았으므로 받지 않는다 */
export function validateSettlementMonth(month: string, now: Date = new Date()): void {
  const m = MONTH.exec(month);
  if (!m) throw new BadRequestException('정산 월은 YYYY-MM 형식이어야 합니다');
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const target = Number(m[1]) * 12 + (Number(m[2]) - 1);
  if (target >= current) throw new BadRequestException('끝난 달의 확정 수익만 기록할 수 있습니다');
}
