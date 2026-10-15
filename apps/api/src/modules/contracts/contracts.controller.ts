import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatorGuard, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import { ContractDto, ContractPreviewDto, ContractSummaryDto, SignContractDto, VoidContractDto } from './contracts.dto.js';
import { ContractsService } from './contracts.service.js';

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('contracts')
  @ApiOperation({ summary: '내가 당사자인 계약 목록 (관리자는 전체)' })
  @ApiOkResponse({ type: [ContractSummaryDto] })
  list(@CurrentUser() user: Viewer) {
    return this.contracts.list(user);
  }

  @Post('contracts/channel-publishing')
  @UseGuards(CreatorGuard)
  @HttpCode(200)
  @ApiOperation({ summary: '내 채널 게시 계약 (없으면 지금 버전으로 만든다. 영상 제출 전에 서명)' })
  @ApiOkResponse({ type: ContractDto })
  channel(@CurrentUser() user: Viewer) {
    return this.contracts.channelContract(user);
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: '계약서 보기 (당사자·관리자, 비밀유지 서약서는 작가도)' })
  @ApiOkResponse({ type: ContractDto })
  get(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.contracts.get(id, user);
  }

  @Post('contracts/:id/sign')
  @HttpCode(200)
  @ApiOperation({ summary: '전자서명 (계약서에 적힌 이름 입력 + 동의). 서명 시각·접속 정보를 남긴다' })
  @ApiOkResponse({ type: ContractDto })
  sign(
    @Param('id') id: string,
    @CurrentUser() user: Viewer,
    @Body() dto: SignContractDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.contracts.sign(id, user, dto, { ip: ip || null, userAgent: userAgent ?? null });
  }

  @Get('deals/:id/contract')
  @ApiOperation({ summary: '딜의 대본 이용허락 계약서' })
  @ApiOkResponse({ type: ContractDto })
  forDeal(@Param('id') dealId: string, @CurrentUser() user: Viewer) {
    return this.contracts.forDeal(dealId, user);
  }

  @Get('scripts/:id/nda-preview')
  @UseGuards(CreatorGuard)
  @ApiOperation({ summary: '열람 요청 전에 읽을 비밀유지 서약서 본문' })
  @ApiOkResponse({ type: ContractPreviewDto })
  ndaPreview(@Param('id') scriptId: string, @CurrentUser() user: Viewer) {
    return this.contracts.previewNda(scriptId, user);
  }

  @Post('admin/contracts/:id/void')
  @Roles('ADMIN')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자: 계약 무효 처리 (서명 기록은 남는다)' })
  @ApiOkResponse({ type: ContractDto })
  void(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: VoidContractDto) {
    return this.contracts.void(id, user, dto.reason);
  }
}
