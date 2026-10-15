import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AUTH_COOKIE, CurrentUser, JwtAuthGuard, type AuthUser } from '../../core/auth/index.js';
import { OptionalJwtAuthGuard } from '../scripts/optional-jwt.guard.js';
import { ChangePasswordDto, PublicProfileDto, UpdateProfileDto, WithdrawDto } from './profiles.dto.js';
import { ProfilesService } from './profiles.service.js';

@ApiTags('profiles')
@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('users/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '공개 프로필 (공개한 계정만. 이메일은 공개한 경우에만)' })
  @ApiOkResponse({ type: PublicProfileDto })
  get(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.profiles.get(id, user ?? null);
  }

  @Patch('me/profile')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 프로필 수정 (이름, 소개, 프로필·이메일 공개)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(user, dto);
  }

  @Patch('me/password')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '비밀번호 변경 (지금 비밀번호 확인)' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.profiles.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  @Delete('me')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회원 탈퇴 (비밀번호 확인). 같은 이메일로 다시 가입할 수 있다' })
  async withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto, @Res({ passthrough: true }) res: Response) {
    await this.profiles.withdraw(user, dto.password);
    res.clearCookie(AUTH_COOKIE, { path: '/' });
  }
}
