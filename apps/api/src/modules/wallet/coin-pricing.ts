/** 코인 가격표. 바꾸면 웹 화면에도 그대로 반영된다 (GET /coins) */
export const COIN_PRICES = {
  /** 메시지 1건 */
  MESSAGE: 1,
  /** 미리보기 대본 열람권 (대본당 한 번) */
  PREVIEW_UNLOCK: 3,
  /** 대본 파일 업로드 1회 (새 초안·전문 교체·미리보기 모두) */
  SCRIPT_UPLOAD: 5,
} as const;

export type CoinUseName = keyof typeof COIN_PRICES;

/** 가입하면 주는 코인 */
export const SIGNUP_BONUS = 10;

/** 구매 패키지. 실제 결제는 아직 연동하지 않았고 테스트 결제로 바로 충전된다 */
export const COIN_PACKAGES = [
  { id: 'coins_10', coins: 10, priceKrw: 1_000, label: '10코인' },
  { id: 'coins_55', coins: 55, priceKrw: 5_000, label: '55코인 (5코인 보너스)' },
  { id: 'coins_120', coins: 120, priceKrw: 10_000, label: '120코인 (20코인 보너스)' },
] as const;

export const COIN_USE_LABEL: Record<CoinUseName, string> = {
  MESSAGE: '메시지',
  PREVIEW_UNLOCK: '미리보기 열람',
  SCRIPT_UPLOAD: '대본 업로드',
};
