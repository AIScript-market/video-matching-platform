import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth';
import type { Viewer } from '../access/access-rules';
import { CreateLedgerEntryDto, LedgerDto, LedgerEntryDto } from './dto/ledger.dto';
import { LedgerService } from './ledger.service';

@ApiTags('ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('deals/:id/ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @ApiOperation({ summary: '딜 장부 조회 (참여자·관리자)' })
  @ApiOkResponse({ type: LedgerDto })
  get(@Param('id') dealId: string, @CurrentUser() user: Viewer) {
    return this.ledger.get(dealId, user);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: '장부 기록 (관리자 수동 기록)' })
  @ApiOkResponse({ type: LedgerEntryDto })
  record(@Param('id') dealId: string, @CurrentUser() user: Viewer, @Body() dto: CreateLedgerEntryDto) {
    return this.ledger.record(dealId, user, dto);
  }
}
