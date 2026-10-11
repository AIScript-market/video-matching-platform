import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../../core/auth/index.js';
import { CoinTransactionPageDto, PurchaseCoinsDto, TransactionsQueryDto, WalletDto } from './wallet.dto.js';
import { WalletService } from './wallet.service.js';

@ApiTags('coins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coins')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: '내 코인 잔액, 가격표, 구매 패키지' })
  @ApiOkResponse({ type: WalletDto })
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.wallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: '내 코인 사용·충전 내역 (최신순)' })
  @ApiOkResponse({ type: CoinTransactionPageDto })
  history(@CurrentUser() user: AuthUser, @Query() query: TransactionsQueryDto) {
    return this.wallet.history(user.id, query.cursor);
  }

  @Post('purchase')
  @HttpCode(200)
  @ApiOperation({ summary: '코인 구매 (지금은 테스트 결제로 바로 충전)' })
  @ApiOkResponse({ type: WalletDto })
  purchase(@CurrentUser() user: AuthUser, @Body() dto: PurchaseCoinsDto) {
    return this.wallet.purchase(user.id, dto.packageId);
  }
}
