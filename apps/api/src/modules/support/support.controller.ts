import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import { OptionalJwtAuthGuard } from '../scripts/optional-jwt.guard.js';
import {
  CreateInquiryDto,
  CreateInquiryReplyDto,
  HideInquiryDto,
  InquiryDetailDto,
  InquiryPageDto,
  InquirySummaryDto,
  ListInquiriesQueryDto,
} from './support.dto.js';
import { SupportService } from './support.service.js';

@ApiTags('support')
@Controller('inquiries')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '문의 게시판 목록 (비로그인도 볼 수 있다. 비밀 문의는 제목·작성자를 가린다)' })
  @ApiOkResponse({ type: InquiryPageDto })
  list(@CurrentUser() viewer: Viewer | undefined, @Query() query: ListInquiriesQueryDto) {
    return this.support.list(viewer ?? null, query);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '문의 보기 (비밀 문의는 작성자·운영자만)' })
  @ApiOkResponse({ type: InquiryDetailDto })
  get(@Param('id') id: string, @CurrentUser() viewer: Viewer | undefined) {
    return this.support.get(id, viewer ?? null);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '문의 쓰기 (로그인한 사용자, 기본은 비밀 문의)' })
  @ApiOkResponse({ type: InquiryDetailDto })
  create(@CurrentUser() user: Viewer, @Body() dto: CreateInquiryDto) {
    return this.support.create(user, dto);
  }

  @Post(':id/replies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '답글 (작성자·운영자). 운영자가 달면 답변 완료, 작성자가 달면 답변 대기' })
  @ApiOkResponse({ type: InquiryDetailDto })
  reply(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: CreateInquiryReplyDto) {
    return this.support.reply(id, user, dto);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '해결됨으로 닫기 (작성자·운영자). 작성자가 다시 답글을 달면 열린다' })
  @ApiOkResponse({ type: InquiryDetailDto })
  close(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.support.close(id, user);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/inquiries')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Post(':id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자: 문의 숨기기·다시 보이기 (스팸·부적절한 글)' })
  @ApiOkResponse({ type: InquirySummaryDto })
  hide(@Param('id') id: string, @Body() dto: HideInquiryDto) {
    return this.support.hide(id, dto.hidden);
  }
}
