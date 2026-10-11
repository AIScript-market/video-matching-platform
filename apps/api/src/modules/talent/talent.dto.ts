import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ACTIVATION_STEPS, CONTENT_TAGS, POLICY_VERSION, type ActivationStep, type ContentTag } from './likeness-policy.js';

export const TALENT_KINDS = ['ACTOR', 'GENERAL'] as const;
export type TalentKind = (typeof TALENT_KINDS)[number];
export const TALENT_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'WITHDRAWING', 'WITHDRAWN'] as const;
export const ASSET_KINDS = ['FACE_SCAN', 'VOICE', 'MOTION'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export class VerifyIdentityDto {
  @ApiProperty({ description: '본인인증 provider가 돌려준 토큰. 개발용 가짜 provider는 `test:<실명>:<YYYY-MM-DD>`', example: 'test:홍길동:1998-03-14' })
  @IsString()
  @MaxLength(2000)
  token!: string;
}

export class IdentityDto {
  @ApiProperty() legalName!: string;
  @ApiProperty() isMinor!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: '미성년자만: 만 19세가 되는 날' }) adultOn!: Date | null;
  @ApiProperty() verifiedAt!: Date;
}

export class CreateTalentProfileDto {
  @ApiProperty({ enum: TALENT_KINDS, description: 'ACTOR=배우, GENERAL=일반인' })
  @IsIn(TALENT_KINDS)
  kind!: TalentKind;

  @ApiProperty({ example: '한별' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  stageName!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({ enum: CONTENT_TAGS, isArray: true, description: '출연을 허용하는 장면 유형' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(CONTENT_TAGS.length)
  @IsIn(CONTENT_TAGS, { each: true })
  allowedTags!: ContentTag[];

  @ApiPropertyOptional({ description: '최저 출연료 (원)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  minFeeKrw?: number;

  @ApiPropertyOptional({ description: '미성년자: 보호자가 가입한(또는 가입할) 이메일' })
  @IsOptional()
  @IsEmail()
  guardianEmail?: string;
}

export class UpdateTalentProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(40) stageName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) bio?: string;

  @ApiPropertyOptional({ enum: CONTENT_TAGS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CONTENT_TAGS, { each: true })
  allowedTags?: ContentTag[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) minFeeKrw?: number;
  @ApiPropertyOptional() @IsOptional() @IsEmail() guardianEmail?: string;
}

export class ConsentDto {
  @ApiProperty({ description: '동의한 정책 버전', example: POLICY_VERSION })
  @IsIn([POLICY_VERSION])
  policyVersion!: string;

  @ApiProperty({ description: '얼굴·음성(민감정보) 처리에 동의', example: true })
  @IsBoolean()
  sensitiveData!: boolean;

  @ApiProperty({ description: '국외 처리(해외 AI 서비스) 고지를 확인', example: true })
  @IsBoolean()
  crossBorder!: boolean;
}

export class UploadAssetDto {
  @ApiProperty({ enum: ASSET_KINDS })
  @IsIn(ASSET_KINDS)
  kind!: AssetKind;
}

export class TalentDirectoryQueryDto {
  @ApiPropertyOptional({ enum: TALENT_KINDS })
  @IsOptional()
  @IsIn(TALENT_KINDS)
  kind?: TalentKind;

  @ApiPropertyOptional({ enum: CONTENT_TAGS, description: '이 장면 유형을 허용하는 출연자만' })
  @IsOptional()
  @IsIn(CONTENT_TAGS)
  tag?: ContentTag;

  @ApiPropertyOptional({ description: 'true면 미성년자만, false면 성인만' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  minor?: boolean;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class LikenessAssetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ASSET_KINDS }) kind!: AssetKind;
  @ApiProperty() contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty() createdAt!: Date;
}

/** 캐스팅 목록에 보이는 정보: 실명과 원본은 없다 */
export class TalentPublicDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() stageName!: string;
  @ApiProperty({ enum: TALENT_KINDS }) kind!: TalentKind;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ enum: CONTENT_TAGS, isArray: true }) allowedTags!: ContentTag[];
  @ApiProperty() minFeeKrw!: number;
  @ApiProperty({ description: '미성년자 여부 (계약에 보호자 승인 필요)' }) isMinor!: boolean;
}

export class TalentSelfDto extends TalentPublicDto {
  @ApiProperty({ enum: TALENT_STATUSES }) status!: (typeof TALENT_STATUSES)[number];
  @ApiProperty({ enum: ACTIVATION_STEPS, isArray: true, description: '캐스팅 가능해지기까지 남은 단계' })
  missingSteps!: ActivationStep[];
  @ApiProperty({ type: [LikenessAssetDto] }) assets!: LikenessAssetDto[];
  @ApiProperty({ nullable: true, type: String }) guardianEmail!: string | null;
  @ApiProperty() guardianLinked!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) withdrawRequestedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: '원본·모델이 삭제될 시각' }) purgeAfter!: Date | null;
}

export class AccessLogEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userDisplayName!: string;
  @ApiProperty({ nullable: true, type: String }) contractId!: string | null;
  @ApiProperty({ enum: ['SELF', 'PRODUCTION'] }) purpose!: string;
  @ApiProperty() accessedAt!: Date;
}

export class WardDto {
  @ApiProperty() talentId!: string;
  @ApiProperty() stageName!: string;
  @ApiProperty({ enum: TALENT_STATUSES }) status!: (typeof TALENT_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) guardianConsentAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) guardianVerifiedAt!: Date | null;
}
