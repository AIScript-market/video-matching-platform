import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import {
  AdminReportDto,
  AdminReportPageDto,
  CreateReportDto,
  ListReportsQueryDto,
  ReportedUserDto,
  ReportReceiptDto,
  ResolveReportDto,
} from './reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('users/:id/reports')
  @ApiOperation({ summary: '계정 신고 (로그인한 사용자). 같은 계정을 처리 전에 다시 신고할 수 없다' })
  @ApiOkResponse({ type: ReportReceiptDto })
  report(@CurrentUser() user: AuthUser, @Param('id') targetId: string, @Body() dto: CreateReportDto) {
    return this.reports.create(user, targetId, dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reported-users')
  @ApiOperation({ summary: '신고된 계정 (처리 전 신고가 있는 계정, 많이 신고된 순)' })
  @ApiOkResponse({ type: [ReportedUserDto] })
  reportedUsers() {
    return this.reports.reportedUsers();
  }

  @Get('reports')
  @ApiOperation({ summary: '신고 목록 (최신순). 상태·대상 계정으로 거르기' })
  @ApiOkResponse({ type: AdminReportPageDto })
  list(@Query() query: ListReportsQueryDto) {
    return this.reports.list(query);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: '신고 처리: 조치함(RESOLVED) / 기각(DISMISSED). suspend=true면 계정 정지 후 처리' })
  @ApiOkResponse({ type: AdminReportDto })
  resolve(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(admin, id, dto);
  }
}
