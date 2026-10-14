export type RoleName = 'WRITER' | 'PRODUCER' | 'ADMIN';
export type UserStatusName = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';

/** 인증된 요청의 request.user. @CurrentUser()가 돌려주는 값 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** 계정 종류: 빈 배열이면 일반 계정, ADMIN이 있으면 관리자 */
  roles: RoleName[];
  status: UserStatusName;
  bio: string | null;
  profilePublic: boolean;
  emailPublic: boolean;
}

export interface JwtPayload {
  sub: string;
}

export const AUTH_COOKIE = 'vmp_token';

/** 가드·서비스가 사용자 정보를 읽을 때 쓰는 select */
export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  roles: true,
  status: true,
  bio: true,
  profilePublic: true,
  emailPublic: true,
} as const;

/**
 * 대본 제공·영상 제작을 할 수 있는가: 프로필(소개 포함)을 공개해야 한다.
 * 이메일 공개는 필요 없다. 계약 전 연락은 플랫폼 메시지로만 한다 (직거래를 쉽게 만들지 않으려고, docs/business-model.md).
 * 관리자 계정은 운영용이라 창작 활동 대상이 아니다.
 */
export function isCreatorReady(user: Pick<AuthUser, 'bio' | 'profilePublic' | 'roles'>): boolean {
  return !user.roles.includes('ADMIN') && user.profilePublic && Boolean(user.bio?.trim());
}
