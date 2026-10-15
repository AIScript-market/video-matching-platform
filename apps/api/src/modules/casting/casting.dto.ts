import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CONTENT_TAGS, DEFAULT_EARLY_TERMINATION_PCT, MAX_PRODUCTION_DAYS, type ContentTag } from '../talent/likeness-policy.js';

export const FEE_MAX_KRW = 2_000_000_000;
export const FEE_TYPES = ['FLAT', 'PER_EPISODE', 'REVENUE_SHARE', 'HYBRID'] as const;
export type FeeType = (typeof FEE_TYPES)[number];
export const USAGE_SCOPES = ['DIGITAL', 'LIVE', 'BOTH'] as const;
export type UsageScope = (typeof USAGE_SCOPES)[number];
export const CASTING_SIDES = ['STUDIO', 'TALENT'] as const;
export type CastingSide = (typeof CASTING_SIDES)[number];
export const ROLE_STATUSES = ['OPEN', 'CAST', 'CLOSED'] as const;
export const CASTING_NEGOTIATION_STATUSES = ['OPEN', 'AGREED', 'CLOSED'] as const;
export const CASTING_OFFER_STATUSES = ['PROPOSED', 'COUNTERED', 'WITHDRAWN', 'PENDING_GUARDIAN', 'REJECTED_BY_GUARDIAN', 'ACCEPTED'] as const;
export const CONTRACT_STATUSES = ['ACTIVE', 'TERMINATED', 'EXPIRED'] as const;

export class PartyDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

export class CreateProjectDto {
  @ApiProperty({ example: '마지막 열차 (유튜브 6부작)' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class ProjectDto {
  @ApiProperty() id!: string;
  @ApiProperty() dealId!: string;
  @ApiProperty() scriptId!: string;
  @ApiProperty() scriptTitle!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: [PartyDto], description: '기획사 구성원 (딜의 작가와 제작자)' }) members!: PartyDto[];
  @ApiProperty() createdAt!: Date;
}

export class CreateRoleDto {
  @ApiProperty({ example: '정수 (역무원)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: '만 19세 미만 인물 (학원물 학생 등)', default: false })
  @IsOptional()
  @IsBoolean()
  isMinorRole?: boolean;

  @ApiProperty({ enum: CONTENT_TAGS, isArray: true, description: '이 배역에 들어가는 장면 유형' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(CONTENT_TAGS.length)
  @IsIn(CONTENT_TAGS, { each: true })
  contentTags!: ContentTag[];
}

export class RoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() projectTitle!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() isMinorRole!: boolean;
  @ApiProperty({ enum: CONTENT_TAGS, isArray: true }) contentTags!: ContentTag[];
  @ApiProperty({ enum: ROLE_STATUSES }) status!: (typeof ROLE_STATUSES)[number];
  @ApiProperty() createdAt!: Date;
}

export class ApplyDto {
  @ApiPropertyOptional({ maxLength: 1000, description: '지원 메시지' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class InviteDto {
  @ApiProperty({ description: '제안할 출연자 id (캐스팅 목록의 id)' })
  @IsString()
  talentId!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class CreateCastingOfferDto {
  @ApiProperty({ enum: FEE_TYPES, description: 'FLAT=고정, PER_EPISODE=회당, REVENUE_SHARE=수익 배분, HYBRID=고정+배분' })
  @IsIn(FEE_TYPES)
  feeType!: FeeType;

  @ApiPropertyOptional({ description: '고정 출연료 (원). FLAT, HYBRID' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(FEE_MAX_KRW)
  flatFeeKrw?: number;

  @ApiPropertyOptional({ description: '회당 출연료 (원). PER_EPISODE' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(FEE_MAX_KRW)
  perEpisodeFeeKrw?: number;

  @ApiPropertyOptional({ description: '회차 수. PER_EPISODE' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  episodes?: number;

  @ApiPropertyOptional({ description: '작품 순수익 중 배분 비율(%). REVENUE_SHARE, HYBRID' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  revenueSharePct?: number;

  @ApiProperty({ enum: USAGE_SCOPES, description: 'DIGITAL=디지털 출연, LIVE=실제 촬영, BOTH' })
  @IsIn(USAGE_SCOPES)
  usage!: UsageScope;

  @ApiProperty({ minimum: 1, maximum: 120, description: '계약 기간 (개월). 이 기간 동안 작품이 공개된다' })
  @IsInt()
  @Min(1)
  @Max(120)
  termMonths!: number;

  @ApiProperty() @IsBoolean() exclusive!: boolean;

  @ApiPropertyOptional({ default: true, description: '출연분 확인권: 출연자가 확인해야 공개할 수 있다' })
  @IsOptional()
  @IsBoolean()
  requiresTalentApproval?: boolean;

  @ApiProperty({ minimum: 1, maximum: MAX_PRODUCTION_DAYS, description: '계약일부터 새 장면을 제작할 수 있는 기간 (일)' })
  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCTION_DAYS)
  productionDays!: number;

  @ApiPropertyOptional({ default: DEFAULT_EARLY_TERMINATION_PCT, description: '조기 종료 보상: 고정 출연료 반환 + 이 비율(%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  earlyTerminationPct?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CastingOfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() negotiationId!: string;
  @ApiProperty() proposerId!: string;
  @ApiProperty({ enum: CASTING_SIDES }) side!: CastingSide;
  @ApiProperty({ enum: FEE_TYPES }) feeType!: FeeType;
  @ApiProperty() flatFeeKrw!: number;
  @ApiProperty() perEpisodeFeeKrw!: number;
  @ApiProperty({ nullable: true, type: Number }) episodes!: number | null;
  @ApiProperty() revenueSharePct!: number;
  @ApiProperty({ enum: USAGE_SCOPES }) usage!: UsageScope;
  @ApiProperty() termMonths!: number;
  @ApiProperty() exclusive!: boolean;
  @ApiProperty() requiresTalentApproval!: boolean;
  @ApiProperty() productionDays!: number;
  @ApiProperty() earlyTerminationPct!: number;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ enum: CASTING_OFFER_STATUSES }) status!: (typeof CASTING_OFFER_STATUSES)[number];
  @ApiProperty() createdAt!: Date;
}

export class CastingNegotiationDto {
  @ApiProperty() id!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty({ enum: CONTENT_TAGS, isArray: true }) roleContentTags!: ContentTag[];
  @ApiProperty() projectId!: string;
  @ApiProperty() projectTitle!: string;
  @ApiProperty() talentId!: string;
  @ApiProperty() talentStageName!: string;
  @ApiProperty() talentIsMinor!: boolean;
  @ApiProperty({ enum: CASTING_SIDES }) initiatedBy!: CastingSide;
  @ApiProperty({ nullable: true, type: String }) message!: string | null;
  @ApiProperty({ enum: CASTING_NEGOTIATION_STATUSES }) status!: (typeof CASTING_NEGOTIATION_STATUSES)[number];
  @ApiProperty({ enum: [...CASTING_SIDES, 'GUARDIAN'], description: '요청한 사람이 이 협상에서 어느 쪽인지' }) viewerSide!: CastingSide | 'GUARDIAN';
  @ApiProperty({ nullable: true, type: String }) contractId!: string | null;
  @ApiProperty({ type: [CastingOfferDto], description: '제안 이력 (오래된 순)' }) offers!: CastingOfferDto[];
  @ApiProperty() createdAt!: Date;
}

export class GuardianDecisionDto {
  @ApiProperty({ description: 'true=승인, false=거절' })
  @IsBoolean()
  approve!: boolean;
}

export class CastingContractDto {
  @ApiProperty() id!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() projectTitle!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() talentId!: string;
  @ApiProperty() talentStageName!: string;
  @ApiProperty({ enum: FEE_TYPES }) feeType!: FeeType;
  @ApiProperty() flatFeeKrw!: number;
  @ApiProperty() perEpisodeFeeKrw!: number;
  @ApiProperty({ nullable: true, type: Number }) episodes!: number | null;
  @ApiProperty() revenueSharePct!: number;
  @ApiProperty({ enum: USAGE_SCOPES }) usage!: UsageScope;
  @ApiProperty({ enum: CONTENT_TAGS, isArray: true }) contentTags!: ContentTag[];
  @ApiProperty() exclusive!: boolean;
  @ApiProperty() requiresTalentApproval!: boolean;
  @ApiProperty() earlyTerminationPct!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) guardianApprovedAt!: Date | null;
  @ApiProperty() startsAt!: Date;
  @ApiProperty({ description: '이때까지 새 장면 제작 가능' }) productionEndsAt!: Date;
  @ApiProperty({ description: '이때까지 작품 공개 가능' }) endsAt!: Date;
  @ApiProperty({ enum: CONTRACT_STATUSES }) status!: (typeof CONTRACT_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String }) terminationReason!: string | null;
}

export class AcceptCastingDto {
  @ApiProperty({ enum: ['CONTRACTED', 'PENDING_GUARDIAN', 'REJECTED_BY_GUARDIAN'], description: '미성년자는 보호자 승인 전까지 PENDING_GUARDIAN' })
  status!: 'CONTRACTED' | 'PENDING_GUARDIAN' | 'REJECTED_BY_GUARDIAN';
  @ApiProperty({ type: CastingOfferDto }) offer!: CastingOfferDto;
  @ApiProperty({ type: CastingContractDto, nullable: true }) contract!: CastingContractDto | null;
}

export class EarlyTerminationQuoteDto {
  @ApiProperty() contractId!: string;
  @ApiProperty({ description: '반환할 고정 출연료 (원)' }) refundKrw!: number;
  @ApiProperty({ description: '조기 종료 보상 (원)' }) compensationKrw!: number;
  @ApiProperty() totalKrw!: number;
  @ApiProperty({ type: [String], description: '종료되면 내려가는 작품' }) affectedWorkIds!: string[];
}

export class TerminateContractDto {
  @ApiProperty({ maxLength: 1000, description: '종료 사유 (보상금 입금 확인 등)' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
