import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const LEDGER_TYPES = ['REVENUE', 'PAYOUT', 'FEE', 'ADJUSTMENT'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const LEDGER_AMOUNT_LIMIT = 2_000_000_000;

export class CreateLedgerEntryDto {
  @ApiProperty({ enum: LEDGER_TYPES })
  @IsIn(LEDGER_TYPES)
  type!: LedgerType;

  @ApiProperty({
    description: '원 단위 정수. ADJUSTMENT만 음수 가능, 0은 불가',
    minimum: -LEDGER_AMOUNT_LIMIT,
    maximum: LEDGER_AMOUNT_LIMIT,
  })
  @Type(() => Number)
  @IsInt()
  @Min(-LEDGER_AMOUNT_LIMIT)
  @Max(LEDGER_AMOUNT_LIMIT)
  amountKrw!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  @ApiPropertyOptional({ format: 'date-time', description: '생략하면 현재 시각 (UTC)' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class LedgerEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() dealId!: string;
  @ApiProperty({ enum: LEDGER_TYPES }) type!: LedgerType;
  @ApiProperty() amountKrw!: number;
  @ApiProperty({ nullable: true, type: String }) memo!: string | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() createdById!: string;
}

export class LedgerTotalsDto {
  @ApiProperty() REVENUE!: number;
  @ApiProperty() PAYOUT!: number;
  @ApiProperty() FEE!: number;
  @ApiProperty() ADJUSTMENT!: number;
  @ApiProperty({ description: 'REVENUE - PAYOUT - FEE + ADJUSTMENT (아직 지급되지 않은 금액)' })
  balance!: number;
}

export class LedgerDto {
  @ApiProperty() dealId!: string;
  @ApiProperty({ type: [LedgerEntryDto], description: '발생 시각 순' }) entries!: LedgerEntryDto[];
  @ApiProperty({ type: LedgerTotalsDto }) totals!: LedgerTotalsDto;
}
