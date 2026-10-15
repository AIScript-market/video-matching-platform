import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CONTENT_TAGS, TAKEDOWN_REASONS, type ContentTag, type TakedownReason } from '../talent/likeness-policy.js';

export const WORK_STATUSES = ['DRAFT', 'PUBLISHED', 'UNLISTED', 'REMOVED'] as const;
export const TAKEDOWN_STATUSES = ['OPEN', 'UPHELD', 'REJECTED', 'SETTLED'] as const;

export class CreateWorkDto {
  @ApiProperty({ example: '마지막 열차 1화' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: CONTENT_TAGS, isArray: true, description: '이 작품에 실제로 들어간 장면 유형' })
  @IsArray()
  @ArrayUnique()
  @IsIn(CONTENT_TAGS, { each: true })
  contentTags!: ContentTag[];

  @ApiProperty({ type: [String], description: '출연한 계약 id' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  contractIds!: string[];

  @ApiPropertyOptional({ default: true, description: 'AI로 만든 초상을 썼는지 (공개할 때 합성 콘텐츠 표시 필요)' })
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}

export class PublishWorkDto {
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=xxxxxxxxxxx' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  externalUrl!: string;

  @ApiProperty({ description: 'AI 생성물 표시(유튜브 합성 콘텐츠 공개 설정 포함)를 했는지', example: true })
  @IsBoolean()
  syntheticLabelApplied!: boolean;
}

export class WorkAppearanceDto {
  @ApiProperty() contractId!: string;
  @ApiProperty() talentId!: string;
  @ApiProperty() talentStageName!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() requiresApproval!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) approvedAt!: Date | null;
}

export class WorkDto {
  @ApiProperty() id!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() projectTitle!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: CONTENT_TAGS, isArray: true }) contentTags!: ContentTag[];
  @ApiProperty() aiGenerated!: boolean;
  @ApiProperty({ nullable: true, type: String }) externalUrl!: string | null;
  @ApiProperty({ enum: WORK_STATUSES }) status!: (typeof WORK_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: Date | null;
  @ApiProperty({ type: [WorkAppearanceDto] }) appearances!: WorkAppearanceDto[];
  @ApiProperty() createdAt!: Date;
}

export class CreateTakedownDto {
  @ApiProperty({ enum: TAKEDOWN_REASONS, description: 'OUT_OF_SCOPE·PROHIBITED_CONTENT·NOT_APPROVED·IDENTITY_FRAUD·MINOR_PROTECTION은 즉시 비공개' })
  @IsIn(TAKEDOWN_REASONS)
  reason!: TakedownReason;

  @ApiProperty({ maxLength: 2000, example: '계약에 없는 베드신이 들어갔습니다 (3분 12초)' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  details!: string;
}

export class DecideTakedownDto {
  @ApiProperty({ description: 'true=신고 인정(삭제), false=기각(자동 비공개였다면 다시 공개)' })
  @IsBoolean()
  uphold!: boolean;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolution!: string;
}

export class SettleTakedownDto {
  @ApiProperty({ maxLength: 2000, example: '출연자 요청에 합의해 내림' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolution!: string;
}

export class TakedownDto {
  @ApiProperty() id!: string;
  @ApiProperty() workId!: string;
  @ApiProperty() workTitle!: string;
  @ApiProperty() requesterId!: string;
  @ApiProperty({ enum: TAKEDOWN_REASONS }) reason!: TakedownReason;
  @ApiProperty() details!: string;
  @ApiProperty() interimUnlisted!: boolean;
  @ApiProperty({ enum: TAKEDOWN_STATUSES }) status!: (typeof TAKEDOWN_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) reviewDueAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) resolution!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) decidedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
