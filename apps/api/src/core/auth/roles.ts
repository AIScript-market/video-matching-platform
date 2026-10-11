import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, RoleName } from './auth-user.js';

const ROLES_KEY = 'roles';

/** 이 핸들러에 필요한 역할 (하나라도 있으면 통과). JwtAuthGuard 다음에 RolesGuard와 함께 쓴다 */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.roles.some((r) => required.includes(r))) {
      throw new ForbiddenException(`${required.join(' 또는 ')} 역할이 필요합니다`);
    }
    return true;
  }
}

/** 인증된 사용자. 선택 인증(OptionalJwtAuthGuard) 경로에서는 undefined일 수 있다 */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<{ user?: AuthUser }>().user,
);
