import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, NotEquals } from 'class-validator';
import { COIN_PACKAGES } from './coin-pricing.js';

const PACKAGE_IDS = COIN_PACKAGES.map((p) => p.id);

export class PurchaseCoinsDto {
  @ApiProperty({ enum: PACKAGE_IDS })
  @IsIn(PACKAGE_IDS)
  packageId!: string;
}

export class AdjustCoinsDto {
  @ApiProperty({ description: '지급(+) 또는 회수(-) 코인. 잔액이 음수가 될 수 없다', minimum: -100_000, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  @Min(-100_000)
  @Max(100_000)
  amount!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class TransactionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
}

export class CoinPricesDto {
  @ApiProperty() MESSAGE!: number;
  @ApiProperty() PREVIEW_UNLOCK!: number;
  @ApiProperty() SCRIPT_UPLOAD!: number;
}

export class CoinPackageDto {
  @ApiProperty() id!: string;
  @ApiProperty() coins!: number;
  @ApiProperty() priceKrw!: number;
  @ApiProperty() label!: string;
}

export class WalletDto {
  @ApiProperty() balance!: number;
  @ApiProperty({ type: CoinPricesDto }) prices!: CoinPricesDto;
  @ApiProperty({ type: [CoinPackageDto] }) packages!: CoinPackageDto[];
  @ApiProperty({ description: '테스트 결제 여부 (실제 결제 미연동)' }) testPayments!: boolean;
}

export const COIN_TX_TYPES = ['SIGNUP_BONUS', 'PURCHASE', 'SPEND', 'ADMIN_ADJUST'] as const;
export const COIN_USES = ['MESSAGE', 'PREVIEW_UNLOCK', 'SCRIPT_UPLOAD'] as const;

export class CoinTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: COIN_TX_TYPES }) type!: (typeof COIN_TX_TYPES)[number];
  @ApiProperty({ description: '+ 충전 / - 사용' }) amount!: number;
  @ApiProperty() balanceAfter!: number;
  @ApiProperty({ enum: COIN_USES, nullable: true }) use!: (typeof COIN_USES)[number] | null;
  @ApiProperty({ nullable: true, type: String }) refId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) priceKrw!: number | null;
  @ApiProperty({ nullable: true, type: String }) memo!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class CoinTransactionPageDto {
  @ApiProperty({ type: [CoinTransactionDto] }) items!: CoinTransactionDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
