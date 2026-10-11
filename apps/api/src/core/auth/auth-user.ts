export type RoleName = 'WRITER' | 'PRODUCER' | 'ADMIN';

/** 인증된 요청의 request.user. @CurrentUser()가 돌려주는 값 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleName[];
}

export interface JwtPayload {
  sub: string;
}

export const AUTH_COOKIE = 'vmp_token';
