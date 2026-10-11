import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AUTH_COOKIE, CurrentUser, JwtAuthGuard, TOKEN_TTL_SECONDS, type AuthUser } from '../../core/auth/index.js';
import { AuthResultDto, LoginDto, MeDto, SignupDto } from './identity.dto.js';
import { IdentityService } from './identity.service.js';

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

@ApiTags('auth')
@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('auth/signup')
  @ApiOperation({ summary: '회원가입 (작가/제작자, 둘 다 가능). 성공하면 로그인 쿠키도 설정' })
  @ApiOkResponse({ type: AuthResultDto })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.identity.signup(dto);
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('auth/login')
  @HttpCode(200)
  @ApiOperation({ summary: '로그인. 토큰을 응답 본문과 httpOnly 쿠키로 준다' })
  @ApiOkResponse({ type: AuthResultDto })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.identity.login(dto);
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({ summary: '로그아웃 (쿠키 삭제)' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser) {
    return this.identity.me(user.id);
  }
}
