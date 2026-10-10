import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  assertCanRespond,
  assertCanWithdraw,
  buildLicenseScope,
  supersededStatus,
  validateOfferTerms,
  type OfferTerms,
} from './offer-rules';

const base: OfferTerms = {
  writerSharePct: 60,
  producerSharePct: 40,
  upfrontFeeKrw: 5_000_000,
  termMonths: 24,
  exclusive: true,
};

describe('validateOfferTerms', () => {
  it('정상 조건은 통과', () => {
    expect(() => validateOfferTerms(base)).not.toThrow();
    expect(() =>
      validateOfferTerms({ ...base, writerSharePct: 100, producerSharePct: 0, upfrontFeeKrw: 0 }),
    ).not.toThrow();
  });

  it('비율 합이 100이 아니면 거부', () => {
    expect(() => validateOfferTerms({ ...base, producerSharePct: 50 })).toThrow(
      BadRequestException,
    );
  });

  it('비율·금액·기간이 정수가 아니거나 범위를 벗어나면 거부', () => {
    for (const bad of [
      { writerSharePct: 60.5, producerSharePct: 39.5 },
      { writerSharePct: -10, producerSharePct: 110 },
      { upfrontFeeKrw: -1 },
      { upfrontFeeKrw: 1000.5 },
      { termMonths: 0 },
      { termMonths: 121 },
    ]) {
      expect(() => validateOfferTerms({ ...base, ...bad })).toThrow(BadRequestException);
    }
  });
});

describe('제안 응답 권한', () => {
  const offer = { proposerId: 'producer', status: 'PROPOSED' as const };

  it('상대방만 수락·거절 가능', () => {
    expect(() => assertCanRespond(offer, 'writer')).not.toThrow();
    expect(() => assertCanRespond(offer, 'producer')).toThrow(ForbiddenException);
  });

  it('PROPOSED가 아니면 수락·거절 불가', () => {
    expect(() => assertCanRespond({ ...offer, status: 'COUNTERED' }, 'writer')).toThrow(
      ConflictException,
    );
  });

  it('제안자만 철회 가능', () => {
    expect(() => assertCanWithdraw(offer, 'producer')).not.toThrow();
    expect(() => assertCanWithdraw(offer, 'writer')).toThrow(ForbiddenException);
    expect(() => assertCanWithdraw({ ...offer, status: 'ACCEPTED' }, 'producer')).toThrow(
      ConflictException,
    );
  });
});

describe('supersededStatus', () => {
  it('상대 제안 위에 새 제안을 내면 역제안(COUNTERED)', () => {
    expect(supersededStatus({ proposerId: 'a', status: 'PROPOSED' }, 'b')).toBe('COUNTERED');
  });
  it('내 제안 위에 새 제안을 내면 기존 것은 WITHDRAWN', () => {
    expect(supersededStatus({ proposerId: 'a', status: 'PROPOSED' }, 'a')).toBe('WITHDRAWN');
  });
});

describe('buildLicenseScope', () => {
  it('조건을 사람이 읽을 수 있는 문장으로 만든다', () => {
    const scope = buildLicenseScope({ ...base, notes: '해외 판권 제외' });
    expect(scope).toContain('독점');
    expect(scope).toContain('24개월');
    expect(scope).toContain('작가 60% / 제작자 40%');
    expect(scope).toContain('5,000,000원');
    expect(scope).toContain('해외 판권 제외');
  });
});
