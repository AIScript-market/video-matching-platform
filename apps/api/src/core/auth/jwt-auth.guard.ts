import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUTH_COOKIE, AUTH_USER_SELECT, type AuthUser, type JwtPayload } from './auth-user.js';

/** Authorization: Bearer <token> 또는 httpOnly 쿠키(vmp_token)의 JWT를 검증한다. */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookie = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  return cookie || null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('로그인이 필요합니다');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('로그인이 만료되었거나 올바르지 않습니다');
    }
    // 정지·프로필 변경이 바로 반영되도록 매 요청마다 사용자를 다시 읽는다
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: AUTH_USER_SELECT });
    if (!user || user.status === 'WITHDRAWN') throw new UnauthorizedException('사용자를 찾을 수 없습니다');
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException({ message: '이용이 정지된 계정입니다', error: 'ACCOUNT_SUSPENDED' });
    }
    req.user = user;
    return true;
  }
}
