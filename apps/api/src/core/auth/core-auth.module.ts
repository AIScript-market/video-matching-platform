import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.js';

export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET이 필요합니다');
  return 'dev-only-insecure-secret';
}

@Global()
@Module({
  imports: [
    JwtModule.register({ secret: jwtSecret(), signOptions: { expiresIn: TOKEN_TTL_SECONDS } }),
  ],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class CoreAuthModule {}
