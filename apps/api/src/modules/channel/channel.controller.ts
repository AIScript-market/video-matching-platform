import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatorGuard, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import {
  ChannelVideoDto,
  CreateVideoUploadDto,
  ListVideosQueryDto,
  PublishVideoDto,
  RecordPayoutDto,
  RecordRevenueDto,
  RemoveVideoDto,
  ReviewVideoDto,
  RevenueLineDto,
  SettlementDto,
  SubmitVideoDto,
  VideoFileQueryDto,
  VideoFileUrlDto,
  VideoUploadDto,
} from './channel.dto.js';
import { ChannelService } from './channel.service.js';

@ApiTags('channel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ChannelController {
  constructor(private readonly channel: ChannelService) {}

  @Post('deals/:id/videos/uploads')
  @UseGuards(CreatorGuard)
  @ApiOperation({ summary: '영상 파일 올리기 주소 (딜의 제작자). 받은 주소로 파일을 저장소에 바로 PUT 한 뒤 key를 fileKey로 제출한다' })
  @ApiOkResponse({ type: VideoUploadDto })
  createUpload(@Param('id') dealId: string, @CurrentUser() user: Viewer, @Body() dto: CreateVideoUploadDto) {
    return this.channel.createUpload(dealId, user, dto);
  }

  @Post('deals/:id/videos')
  @UseGuards(CreatorGuard)
  @ApiOperation({ summary: '영상 제출 (딜의 제작자, 딜 ACTIVE + 채널 게시 계약 서명 필요, 권리 항목 모두 확인)' })
  @ApiOkResponse({ type: ChannelVideoDto })
  submit(@Param('id') dealId: string, @CurrentUser() user: Viewer, @Body() dto: SubmitVideoDto) {
    return this.channel.submit(dealId, user, dto);
  }

  @Get('deals/:id/videos')
  @ApiOperation({ summary: '딜의 제출 영상 (참여자·관리자)' })
  @ApiOkResponse({ type: [ChannelVideoDto] })
  list(@Param('id') dealId: string, @CurrentUser() user: Viewer) {
    return this.channel.listForDeal(dealId, user);
  }

  @Get('deals/:id/settlement')
  @ApiOperation({ summary: '딜의 정산서 (영상·월별 확정 수익, 작가·제작자 몫, 지급 기록)' })
  @ApiOkResponse({ type: SettlementDto })
  settlement(@Param('id') dealId: string, @CurrentUser() user: Viewer) {
    return this.channel.settlement(dealId, user);
  }

  @Get('admin/videos')
  @Roles('ADMIN')
  @ApiOperation({ summary: '관리자: 제출 영상 목록 (오래된 순)' })
  @ApiOkResponse({ type: [ChannelVideoDto] })
  adminList(@Query() query: ListVideosQueryDto) {
    return this.channel.adminList(query.status);
  }

  @Get('admin/videos/:id/file')
  @Roles('ADMIN')
  @ApiOperation({ summary: '관리자: 저장소에 올라온 영상을 보거나 내려받을 주소 (30분)' })
  @ApiOkResponse({ type: VideoFileUrlDto })
  file(@Param('id') id: string, @Query() query: VideoFileQueryDto) {
    return this.channel.fileUrl(id, query.download === true);
  }

  @Post('admin/videos/:id/review')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자: 검수 (승인·거절)' })
  @ApiOkResponse({ type: ChannelVideoDto })
  review(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: ReviewVideoDto) {
    return this.channel.review(id, user, dto);
  }

  @Post('admin/videos/:id/publish')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자: 채널에 올린 뒤 YouTube 영상 번호 기록' })
  @ApiOkResponse({ type: ChannelVideoDto })
  publish(@Param('id') id: string, @Body() dto: PublishVideoDto) {
    return this.channel.publish(id, dto);
  }

  @Post('admin/videos/:id/remove')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자: 게시 중단 (이유는 제작자에게 보인다)' })
  @ApiOkResponse({ type: ChannelVideoDto })
  remove(@Param('id') id: string, @Body() dto: RemoveVideoDto) {
    return this.channel.remove(id, dto.note);
  }

  @Post('admin/videos/:id/revenues')
  @Roles('ADMIN')
  @ApiOperation({ summary: '관리자: 끝난 달 YouTube 확정 광고 수익 기록' })
  @ApiOkResponse({ type: RevenueLineDto })
  revenue(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: RecordRevenueDto) {
    return this.channel.recordRevenue(id, user, dto);
  }

  @Post('admin/revenues/:id/payouts')
  @Roles('ADMIN')
  @ApiOperation({ summary: '관리자: 지급 기록 (금액은 배분율로 자동 계산)' })
  @ApiOkResponse({ type: SettlementDto })
  payout(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: RecordPayoutDto) {
    return this.channel.recordPayout(id, user, dto);
  }
}
