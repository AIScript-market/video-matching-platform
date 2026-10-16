import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isCreatorReady, type AuthUser } from './auth-user.js';

/**
 * 대본 제공·영상 제작 행동(대본 작성·업로드·공개, 열람 요청, 협상·메시지·제안, 미리보기 열람)에 붙인다.
 * JwtAuthGuard 뒤에 써야 한다. 프로필(소개 포함)을 공개하지 않았으면 403 + error: PROFILE_NOT_PUBLIC
 */
@Injectable()
export class CreatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !isCreatorReady(user)) {
      throw new ForbiddenException({
        message: '대본 제공과 영상 제작을 하려면 프로필 소개를 쓰고 프로필을 공개해야 합니다',
        error: 'PROFILE_NOT_PUBLIC',
      });
    }
    return true;
  }
}
