import { BadRequestException } from '@nestjs/common';
import type { LedgerType } from './dto/ledger.dto';

/** REVENUE·PAYOUT·FEE는 양수, ADJUSTMENT는 0이 아닌 정수(음수 가능) */
export function validateLedgerAmount(type: LedgerType, amountKrw: number): void {
  if (!Number.isInteger(amountKrw)) throw new BadRequestException('amountKrw는 정수(원)여야 합니다');
  if (type === 'ADJUSTMENT') {
    if (amountKrw === 0) throw new BadRequestException('조정 금액은 0일 수 없습니다');
  } else if (amountKrw <= 0) {
    throw new BadRequestException(`${type} 금액은 양수여야 합니다`);
  }
}

export function ledgerTotals(entries: Array<{ type: LedgerType; amountKrw: number }>) {
  const totals = { REVENUE: 0, PAYOUT: 0, FEE: 0, ADJUSTMENT: 0 };
  for (const e of entries) totals[e.type] += e.amountKrw;
  return {
    ...totals,
    balance: totals.REVENUE - totals.PAYOUT - totals.FEE + totals.ADJUSTMENT,
  };
}
