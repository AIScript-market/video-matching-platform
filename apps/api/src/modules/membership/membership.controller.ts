import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../../core/auth/index.js';
import { CreateRoleRequestDto, RoleRequestDto } from './membership.dto.js';
import { MembershipService } from './membership.service.js';

@ApiTags('role-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('role-requests')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Post()
  @ApiOperation({ summary: '권한 신청 (대본 제공자 WRITER / 영상 제작자 PRODUCER). 관리자가 승인하면 역할이 생긴다' })
  @ApiOkResponse({ type: RoleRequestDto })
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleRequestDto) {
    return this.membership.request(user, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '내 권한 신청 내역' })
  @ApiOkResponse({ type: [RoleRequestDto] })
  mine(@CurrentUser() user: AuthUser) {
    return this.membership.mine(user.id);
  }
}
