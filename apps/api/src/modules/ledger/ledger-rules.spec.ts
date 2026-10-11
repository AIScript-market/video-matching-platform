import { BadRequestException } from '@nestjs/common';
import { ledgerTotals, validateLedgerAmount } from './ledger-rules.js';

describe('validateLedgerAmount', () => {
  it('수익·지급·수수료는 양수만', () => {
    expect(() => validateLedgerAmount('REVENUE', 1000)).not.toThrow();
    expect(() => validateLedgerAmount('PAYOUT', 0)).toThrow(BadRequestException);
    expect(() => validateLedgerAmount('FEE', -10)).toThrow(BadRequestException);
  });
  it('조정은 0이 아닌 정수, 음수 가능', () => {
    expect(() => validateLedgerAmount('ADJUSTMENT', -500)).not.toThrow();
    expect(() => validateLedgerAmount('ADJUSTMENT', 0)).toThrow(BadRequestException);
    expect(() => validateLedgerAmount('ADJUSTMENT', 1.5)).toThrow(BadRequestException);
  });
});

describe('ledgerTotals', () => {
  it('유형별 합계와 잔액', () => {
    expect(
      ledgerTotals([
        { type: 'REVENUE', amountKrw: 10_000_000 },
        { type: 'FEE', amountKrw: 1_000_000 },
        { type: 'PAYOUT', amountKrw: 6_000_000 },
        { type: 'ADJUSTMENT', amountKrw: -500_000 },
      ]),
    ).toEqual({
      REVENUE: 10_000_000,
      PAYOUT: 6_000_000,
      FEE: 1_000_000,
      ADJUSTMENT: -500_000,
      balance: 2_500_000,
    });
  });
});
