import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import { ListRoleRequestsQueryDto, RoleRequestDto } from '../membership/membership.dto.js';
import { MembershipService } from '../membership/membership.service.js';
import {
  ActivityLogQueryDto,
  MessageLogPageDto,
  UploadLogPageDto,
  ViewLogPageDto,
} from './activity-log.dto.js';
import { ActivityLogService } from './activity-log.service.js';
import { AdminScriptDto, AdminUserDto, HideScriptDto } from './backoffice.dto.js';
import { BackofficeService } from './backoffice.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class BackofficeController {
  constructor(
    private readonly backoffice: BackofficeService,
    private readonly membership: MembershipService,
    private readonly logs: ActivityLogService,
  ) {}

  @Get('logs/messages')
  @ApiOperation({ summary: '메시지 로그 (제작자·작가 간 모든 메시지, 최신순)' })
  @ApiOkResponse({ type: MessageLogPageDto })
  messageLogs(@Query() query: ActivityLogQueryDto) {
    return this.logs.messages(query);
  }

  @Get('logs/views')
  @ApiOperation({ summary: '대본 전문 열람 로그 (최신순)' })
  @ApiOkResponse({ type: ViewLogPageDto })
  viewLogs(@Query() query: ActivityLogQueryDto) {
    return this.logs.views(query);
  }

  @Get('logs/uploads')
  @ApiOperation({ summary: '대본 파일 업로드 로그 (최신순)' })
  @ApiOkResponse({ type: UploadLogPageDto })
  uploadLogs(@Query() query: ActivityLogQueryDto) {
    return this.logs.uploads(query);
  }

  @Get('role-requests')
  @ApiOperation({ summary: '권한 신청 목록 (관리자). status 생략 시 전체' })
  @ApiOkResponse({ type: [RoleRequestDto] })
  roleRequests(@Query() query: ListRoleRequestsQueryDto) {
    return this.membership.list(query.status);
  }

  @Post('role-requests/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: '권한 신청 승인 → 사용자에게 역할 부여 (관리자)' })
  @ApiOkResponse({ type: RoleRequestDto })
  approveRole(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    return this.membership.approve(id, admin);
  }

  @Post('role-requests/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '권한 신청 거절 (관리자)' })
  @ApiOkResponse({ type: RoleRequestDto })
  rejectRole(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
    return this.membership.reject(id, admin);
  }

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 (관리자)' })
  @ApiOkResponse({ type: [AdminUserDto] })
  users() {
    return this.backoffice.users();
  }

  @Get('scripts')
  @ApiOperation({ summary: '공개·숨김 대본 목록 (관리자)' })
  @ApiOkResponse({ type: [AdminScriptDto] })
  scripts() {
    return this.backoffice.scripts();
  }

  @Patch('scripts/:id/hide')
  @ApiOperation({ summary: '대본 숨김 / 숨김 해제 (관리자)' })
  @ApiOkResponse({ type: AdminScriptDto })
  hide(@Param('id') id: string, @Body() dto: HideScriptDto) {
    return this.backoffice.hide(id, dto?.hidden ?? true);
  }
}
