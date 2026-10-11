import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import { DealsService } from './deals.service.js';
import { DealDto } from './dto/deal.dto.js';

@ApiTags('deals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @ApiOperation({ summary: '내 딜 목록 (관리자는 전체)' })
  @ApiOkResponse({ type: [DealDto] })
  list(@CurrentUser() user: Viewer) {
    return this.deals.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: '딜 상세 (라이선스, 수락된 조건 포함)' })
  @ApiOkResponse({ type: DealDto })
  get(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.deals.get(id, user);
  }
}
