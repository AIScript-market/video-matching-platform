import {
  addDays,
  adultOnFrom,
  earlyTerminationAmount,
  isMinorAt,
  minorTagViolations,
  missingActivationSteps,
  missingTags,
  POLICY_VERSION,
  purgeDateFor,
  type ActivationInput,
} from './likeness-policy.js';

const now = new Date('2026-10-11T00:00:00Z');

describe('초상 정책', () => {
  it('만 19세가 되는 날을 계산한다', () => {
    expect(adultOnFrom(new Date('2010-03-05T00:00:00Z')).toISOString()).toBe('2029-03-05T00:00:00.000Z');
    expect(isMinorAt({ isMinor: true, adultOn: new Date('2029-03-05T00:00:00Z') }, now)).toBe(true);
    expect(isMinorAt({ isMinor: true, adultOn: new Date('2026-10-10T00:00:00Z') }, now)).toBe(false);
    expect(isMinorAt({ isMinor: false, adultOn: null }, now)).toBe(false);
  });

  it('철회 후 삭제일: 7일 숙려와 진행 중 제작 기한 중 늦은 날, 최대 90일', () => {
    expect(purgeDateFor(now, [])).toEqual(addDays(now, 7));
    expect(purgeDateFor(now, [addDays(now, 3)])).toEqual(addDays(now, 7));
    expect(purgeDateFor(now, [addDays(now, 20), addDays(now, 45)])).toEqual(addDays(now, 45));
    expect(purgeDateFor(now, [addDays(now, 400)])).toEqual(addDays(now, 90));
  });

  it('허용 범위 밖 장면 유형과 미성년자 금지 유형을 찾는다', () => {
    expect(missingTags(['ROMANCE', 'INTIMACY'], ['ROMANCE'])).toEqual(['INTIMACY']);
    expect(minorTagViolations(['VIOLENCE', 'SUBSTANCE', 'INTIMACY'])).toEqual(['SUBSTANCE', 'INTIMACY']);
  });

  it('조기 종료 보상 = 고정 출연료 반환 + 보상', () => {
    expect(earlyTerminationAmount(1_000_000, 50)).toEqual({ refundKrw: 1_000_000, compensationKrw: 500_000, totalKrw: 1_500_000 });
  });

  describe('등록 단계', () => {
    const adult: ActivationInput = {
      identity: { isMinor: false, adultOn: null },
      livenessVerifiedAt: now,
      activeFaceScans: 1,
      consentedAt: now,
      consentVersion: POLICY_VERSION,
      guardianId: null,
      guardianConsentAt: null,
      guardianVerifiedAt: null,
    };

    it('모두 마친 성인은 남은 단계가 없다', () => {
      expect(missingActivationSteps(adult, now)).toEqual([]);
    });

    it('새 계정은 모든 단계가 남는다', () => {
      expect(missingActivationSteps({ ...adult, identity: null, livenessVerifiedAt: null, activeFaceScans: 0, consentedAt: null }, now)).toEqual([
        'IDENTITY',
        'FACE_SCAN',
        'LIVENESS',
        'CONSENT',
      ]);
    });

    it('정책 버전이 바뀌면 다시 동의해야 한다', () => {
      expect(missingActivationSteps({ ...adult, consentVersion: 'likeness-policy-v0' }, now)).toEqual(['CONSENT']);
    });

    it('미성년자는 보호자 연결·동의·관계 확인이 필요하다', () => {
      const minor = { ...adult, identity: { isMinor: true, adultOn: addDays(now, 365) } };
      expect(missingActivationSteps(minor, now)).toEqual(['GUARDIAN_LINK', 'GUARDIAN_CONSENT', 'GUARDIAN_VERIFIED']);
      expect(missingActivationSteps({ ...minor, guardianId: 'g', guardianConsentAt: now, guardianVerifiedAt: now }, now)).toEqual([]);
    });

    it('성년이 되면 본인이 다시 동의해야 한다', () => {
      const turned = { ...adult, identity: { isMinor: true, adultOn: addDays(now, -1) }, consentedAt: addDays(now, -30) };
      expect(missingActivationSteps(turned, now)).toEqual(['ADULT_RECONSENT']);
      expect(missingActivationSteps({ ...turned, consentedAt: now }, now)).toEqual([]);
    });
  });
});
