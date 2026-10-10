import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_NOTES_LENGTH, MAX_TERM_MONTHS, MAX_UPFRONT_FEE_KRW } from '../offer-rules';

export const NEGOTIATION_STATUSES = ['OPEN', 'AGREED', 'CLOSED'] as const;
export const OFFER_STATUSES = ['PROPOSED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export const MESSAGE_MAX = 2000;

export class CreateMessageDto {
  @ApiProperty({ minLength: 1, maxLength: MESSAGE_MAX })
  @IsString()
  @Length(1, MESSAGE_MAX)
  body!: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ description: '이 메시지 id 이후의 메시지만 (폴링용). 생략하면 최근 100개' })
  @IsOptional()
  @IsString()
  after?: string;
}

export class CreateOfferDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'producerSharePct와 합이 100' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  writerSharePct!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  producerSharePct!: number;

  @ApiProperty({ minimum: 0, maximum: MAX_UPFRONT_FEE_KRW, description: '선급금 (원)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_UPFRONT_FEE_KRW)
  upfrontFeeKrw!: number;

  @ApiProperty({ minimum: 1, maximum: MAX_TERM_MONTHS })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TERM_MONTHS)
  termMonths!: number;

  @ApiProperty()
  @IsBoolean()
  exclusive!: boolean;

  @ApiPropertyOptional({ maxLength: MAX_NOTES_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}

export class UserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

export class ScriptRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

export class OfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() negotiationId!: string;
  @ApiProperty() proposerId!: string;
  @ApiProperty() writerSharePct!: number;
  @ApiProperty() producerSharePct!: number;
  @ApiProperty() upfrontFeeKrw!: number;
  @ApiProperty() termMonths!: number;
  @ApiProperty() exclusive!: boolean;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ enum: OFFER_STATUSES }) status!: (typeof OFFER_STATUSES)[number];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() negotiationId!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class NegotiationDto {
  @ApiProperty() id!: string;
  @ApiProperty() scriptId!: string;
  @ApiProperty() writerId!: string;
  @ApiProperty() producerId!: string;
  @ApiProperty({ enum: NEGOTIATION_STATUSES }) status!: (typeof NEGOTIATION_STATUSES)[number];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: ScriptRefDto }) script!: ScriptRefDto;
  @ApiProperty({ type: UserRefDto }) writer!: UserRefDto;
  @ApiProperty({ type: UserRefDto }) producer!: UserRefDto;
  @ApiProperty({ type: OfferDto, nullable: true, description: '가장 최근 제안' })
  latestOffer!: OfferDto | null;
  @ApiProperty({ nullable: true, type: String, description: '합의되어 생성된 딜 id' })
  dealId!: string | null;
}

export class NegotiationDetailDto extends NegotiationDto {
  @ApiProperty({ type: [OfferDto], description: '제안 이력 (오래된 순)' }) offers!: OfferDto[];
}

export class AcceptOfferResultDto {
  @ApiProperty({ type: OfferDto }) offer!: OfferDto;
  @ApiProperty() dealId!: string;
}
