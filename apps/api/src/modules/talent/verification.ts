import { BadRequestException } from '@nestjs/common';

/** 본인인증 결과 */
export interface VerifiedIdentity {
  legalName: string;
  birthDate: Date;
}

/** 본인인증 provider (PASS, NICE 등). token은 provider의 인증 화면이 돌려준 값 */
export interface IdentityVerifier {
  readonly name: string;
  verify(token: string): Promise<VerifiedIdentity>;
}

/** 실시간 셀카 확인: 살아 있는 사람인지, 등록한 얼굴 스캔과 같은 사람인지 */
export interface LivenessChecker {
  readonly name: string;
  check(input: { selfie: Buffer; reference: Buffer }): Promise<{ live: boolean; sameFace: boolean }>;
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');
export const LIVENESS_CHECKER = Symbol('LIVENESS_CHECKER');

/**
 * 개발용 가짜 본인인증. 토큰 형식: `test:<실명>:<YYYY-MM-DD>`.
 * 누구든 아무 신원이나 주장할 수 있으므로 운영에서는 절대 쓰면 안 된다.
 */
export class FakeIdentityVerifier implements IdentityVerifier {
  readonly name = 'fake';

  async verify(token: string): Promise<VerifiedIdentity> {
    const match = /^test:([^:]{1,50}):(\d{4}-\d{2}-\d{2})$/.exec(token);
    const birthDate = match ? new Date(`${match[2]}T00:00:00.000Z`) : null;
    if (!match || !birthDate || Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new BadRequestException('본인인증에 실패했습니다');
    }
    return { legalName: match[1]!.trim(), birthDate };
  }
}

/** 개발용 가짜 셀카 확인: 파일 내용에 "NOT-LIVE"가 있으면 실시간 아님, "MISMATCH"가 있으면 다른 사람 */
export class FakeLivenessChecker implements LivenessChecker {
  readonly name = 'fake';

  async check(input: { selfie: Buffer; reference: Buffer }) {
    const text = input.selfie.toString('latin1');
    return { live: !text.includes('NOT-LIVE'), sameFace: !text.includes('MISMATCH') };
  }
}

/** 실제 provider를 아직 연동하지 않았으므로 가짜는 개발·시범 환경에서만 허용한다 */
export function fakeVerificationAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_FAKE_VERIFICATION === 'true' || env.NODE_ENV !== 'production';
}
