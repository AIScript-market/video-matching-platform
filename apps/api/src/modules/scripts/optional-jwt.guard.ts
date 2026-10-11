import { ExecutionContext, Injectable } from '@nestjs/common';
import { isObservable, lastValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../core/auth/index.js';

/**
 * 로그인하지 않아도 통과시키되, 유효한 토큰이 있으면 request.user를 채운다.
 * 공개 대본 목록·상세처럼 비로그인 접근과 로그인 사용자별 응답이 둘 다 필요한 곳에 쓴다.
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  // 기반 가드의 반환 타입(boolean | Promise | Observable)에 상관없이 동작하도록 any로 둔다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override canActivate(context: ExecutionContext): any {
    return (async () => {
      try {
        const result = super.canActivate(context);
        await (isObservable(result) ? lastValueFrom(result) : result);
      } catch {
        // 토큰이 없거나 잘못되었으면 비로그인으로 처리
      }
      return true;
    })();
  }
}
