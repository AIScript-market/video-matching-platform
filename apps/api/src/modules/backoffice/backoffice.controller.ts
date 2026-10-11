import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import { AdjustCoinsDto, WalletDto } from '../wallet/wallet.dto.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  ActivityLogQueryDto,
  CoinLogPageDto,
  MessageLogPageDto,
  UploadLogPageDto,
  ViewLogPageDto,
} from './activity-log.dto.js';
import { ActivityLogService } from './activity-log.service.js';
import { AdminScriptDto, AdminUserDto, HideScriptDto, ListUsersQueryDto, SetUserStatusDto } from './backoffice.dto.js';
import { BackofficeService } from './backoffice.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class BackofficeController {
  constructor(
    private readonly backoffice: BackofficeService,
    private readonly wallet: WalletService,
    private readonly logs: ActivityLogService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: '사용자 목록 (관리자). 상태·검색 필터' })
  @ApiOkResponse({ type: [AdminUserDto] })
  users(@Query() query: ListUsersQueryDto) {
    return this.backoffice.users(query);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: '일반 계정 정지·해제 (관리자). 정지된 이메일로는 다시 가입할 수 없다' })
  @ApiOkResponse({ type: AdminUserDto })
  setStatus(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetUserStatusDto) {
    return this.backoffice.setStatus(admin, id, dto);
  }

  @Post('users/:id/coins')
  @HttpCode(200)
  @ApiOperation({ summary: '코인 지급(+)·회수(-) (관리자)' })
  @ApiOkResponse({ type: WalletDto })
  async adjustCoins(@Param('id') id: string, @Body() dto: AdjustCoinsDto) {
    await this.wallet.adjust(id, dto.amount, dto.memo);
    return this.wallet.wallet(id);
  }

  @Get('logs/messages')
  @ApiOperation({ summary: '메시지 로그 (최신순)' })
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

  @Get('logs/coins')
  @ApiOperation({ summary: '코인 충전·사용 로그 (최신순)' })
  @ApiOkResponse({ type: CoinLogPageDto })
  coinLogs(@Query() query: ActivityLogQueryDto) {
    return this.logs.coins(query);
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
