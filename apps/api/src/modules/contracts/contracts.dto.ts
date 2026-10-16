import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FULL_SHARE_BP, MAX_REVENUE_PARTIES } from './revenue-shares.js';

export const CONTRACT_KINDS = ['NDA', 'SCRIPT_LICENSE', 'CHANNEL_PUBLISHING'] as const;
export const CONTRACT_STATUSES = ['AWAITING_SIGNATURES', 'SIGNED', 'VOID', 'SUPERSEDED'] as const;
export const PARTY_ROLES = ['WRITER', 'PRODUCER', 'PLATFORM', 'PERFORMER', 'OTHER'] as const;
/** 변경 계약에 넣을 수 있는 역할 (플랫폼은 자동으로 들어간다) */
export const AMEND_ROLES = ['WRITER', 'PRODUCER', 'PERFORMER', 'OTHER'] as const;

export class ContractPartyDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PARTY_ROLES }) role!: (typeof PARTY_ROLES)[number];
  @ApiProperty({ nullable: true, type: String, description: '같은 역할이 여럿일 때 구분 (예: 공동 작가)' }) label!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: '영상 광고 수익 배분율 (만분율, 10000 = 100%)' }) revenueShareBp!: number | null;
  @ApiProperty({ description: '원 단위 내림 차이를 받는 당사자' }) receivesRemainder!: boolean;
  @ApiProperty({ nullable: true, type: String }) userId!: string | null;
  @ApiProperty({ description: '계약서에 적힌 이름' }) legalName!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, description: '서명할 때 직접 입력한 이름' }) signedName!: string | null;
}

export class ContractSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CONTRACT_KINDS }) kind!: (typeof CONTRACT_KINDS)[number];
  @ApiProperty() templateVersion!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: CONTRACT_STATUSES }) status!: (typeof CONTRACT_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String }) dealId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '이 계약이 바꾸는 이전 계약 (변경 계약)' }) supersedesId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '수익 배분 적용 시작 달 (YYYY-MM). null이면 처음부터' }) effectiveMonth!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ type: [ContractPartyDto] }) parties!: ContractPartyDto[];
  @ApiProperty({ description: '내가 아직 서명해야 하는가' }) awaitingMySignature!: boolean;
}

export class ContractDto extends ContractSummaryDto {
  @ApiProperty({ description: '고정된 계약서 본문 (마크다운)' }) body!: string;
  @ApiProperty({ description: '본문 SHA-256 (hex)' }) bodySha256!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) voidedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty({ description: '서명 화면에 보여 줄 동의 문구' }) signConsent!: string;
}

export class ContractPreviewDto {
  @ApiProperty() templateVersion!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() signConsent!: string;
}

export class SignContractDto {
  @ApiProperty({ description: '서명자가 직접 입력한 이름 (계약서에 적힌 이름과 같아야 한다)', maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  signedName!: string;

  @ApiProperty({ description: '동의 문구에 동의. 반드시 true', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '계약 내용에 동의해야 서명할 수 있습니다' })
  agreed!: boolean;
}

export class VoidContractDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class AmendPartyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  userId!: string;

  @ApiProperty({ enum: AMEND_ROLES })
  @IsIn(AMEND_ROLES)
  role!: (typeof AMEND_ROLES)[number];

  @ApiPropertyOptional({ maxLength: 40, description: '같은 역할이 여럿일 때 구분 (예: 공동 작가, 주연 배우)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty({ nullable: true, type: Number, minimum: 0, maximum: FULL_SHARE_BP, description: '영상 광고 수익 배분율 (만분율). 배분받지 않으면 null' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(FULL_SHARE_BP)
  revenueShareBp!: number | null;

  @ApiPropertyOptional({ description: '원 단위 내림 차이를 받는 당사자 (정확히 한 명)' })
  @IsOptional()
  @IsBoolean()
  receivesRemainder?: boolean;
}

/** 변경 계약: 공동 작가·공동 제작자·출연자를 더하거나 배분율을 바꾼다 */
export class AmendLicenseDto {
  @ApiProperty({ type: [AmendPartyDto], description: '플랫폼을 뺀 모든 당사자 (지금 계약의 작가·제작자 포함)' })
  @ValidateNested({ each: true })
  @Type(() => AmendPartyDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_REVENUE_PARTIES)
  parties!: AmendPartyDto[];

  @ApiPropertyOptional({ maxLength: 1000, description: '변경 사유나 특약' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
