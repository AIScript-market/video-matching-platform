import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import {
  AcceptOfferResultDto,
  ContactResultDto,
  ContactWriterDto,
  CreateMessageDto,
  CreateOfferDto,
  ListMessagesQueryDto,
  MessageDto,
  NegotiationDetailDto,
  NegotiationDto,
  OfferDto,
} from './dto/negotiation.dto.js';
import { NegotiationsService } from './negotiations.service.js';
import { OffersService } from './offers.service.js';

@ApiTags('negotiations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class NegotiationsController {
  constructor(
    private readonly negotiations: NegotiationsService,
    private readonly offers: OffersService,
  ) {}

  @Post('scripts/:id/negotiations')
  @Roles('PRODUCER')
  @ApiOperation({ summary: '협상 시작 (열람 승인된 제작자). 이미 있으면 기존 협상을 반환' })
  @ApiOkResponse({ type: NegotiationDetailDto })
  start(@Param('id') scriptId: string, @CurrentUser() user: Viewer) {
    return this.negotiations.start(scriptId, user);
  }

  @Post('scripts/:id/contact')
  @Roles('PRODUCER')
  @ApiOperation({ summary: '대본 검토 후 작가에게 메시지 보내기 (전문을 열람한 제작자). 협상 대화로 이어진다' })
  @ApiOkResponse({ type: ContactResultDto })
  contact(@Param('id') scriptId: string, @CurrentUser() user: Viewer, @Body() dto: ContactWriterDto) {
    return this.negotiations.contactWriter(scriptId, user, dto.body);
  }

  @Get('negotiations')
  @ApiOperation({ summary: '내 협상 목록' })
  @ApiOkResponse({ type: [NegotiationDto] })
  list(@CurrentUser() user: Viewer) {
    return this.negotiations.list(user);
  }

  @Get('negotiations/:id')
  @ApiOperation({ summary: '협상 상세 + 제안 이력' })
  @ApiOkResponse({ type: NegotiationDetailDto })
  get(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.negotiations.get(id, user);
  }

  @Get('negotiations/:id/messages')
  @ApiOperation({ summary: '메시지 목록. after=<메시지 id>로 폴링' })
  @ApiOkResponse({ type: [MessageDto] })
  messages(@Param('id') id: string, @CurrentUser() user: Viewer, @Query() query: ListMessagesQueryDto) {
    return this.negotiations.listMessages(id, user, query.after);
  }

  @Post('negotiations/:id/messages')
  @ApiOperation({ summary: '메시지 보내기' })
  @ApiOkResponse({ type: MessageDto })
  postMessage(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: CreateMessageDto) {
    return this.negotiations.postMessage(id, user, dto);
  }

  @Post('negotiations/:id/offers')
  @ApiOperation({ summary: '조건 제안 / 역제안. 기존 PROPOSED 제안은 COUNTERED 또는 WITHDRAWN 처리' })
  @ApiOkResponse({ type: OfferDto })
  createOffer(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: CreateOfferDto) {
    return this.offers.create(id, user, dto);
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: '제안 수락 → 딜·라이선스 생성 (매칭)' })
  @ApiOkResponse({ type: AcceptOfferResultDto })
  accept(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.offers.accept(id, user);
  }

  @Post('offers/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '제안 거절' })
  @ApiOkResponse({ type: OfferDto })
  reject(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.offers.reject(id, user);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: '내 제안 철회' })
  @ApiOkResponse({ type: OfferDto })
  withdraw(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.offers.withdraw(id, user);
  }
}
