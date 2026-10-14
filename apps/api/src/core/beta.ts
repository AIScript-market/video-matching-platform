/**
 * 초대제 비공개 베타 설정 (docs/launch-readiness.md, docs/business-model.md).
 * BETA_MODE=true이면 출연자·캐스팅·작품·흥행 판단 API를 아예 올리지 않고, 코인 결제를 끄고, 초대 코드와 성인 확인을 받고 가입시킨다.
 */
export interface BetaConfig {
  enabled: boolean;
  /** 가입에 쓸 수 있는 초대 코드 (대소문자 구분 없음). 비어 있으면 베타 가입이 막힌다 */
  inviteCodes: ReadonlySet<string>;
  /** 베타 가입 때 주는 코인 (결제가 꺼져 있어서 일반 가입 보너스보다 많이) */
  signupCoins: number;
}

export function betaConfig(env: NodeJS.ProcessEnv = process.env): BetaConfig {
  const codes = (env.BETA_INVITE_CODES ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const coins = Number.parseInt(env.BETA_SIGNUP_COINS ?? '', 10);
  return {
    enabled: env.BETA_MODE === 'true',
    inviteCodes: new Set(codes),
    signupCoins: Number.isFinite(coins) && coins >= 0 ? coins : 100,
  };
}
