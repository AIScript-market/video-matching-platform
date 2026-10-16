import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REPORT_REASONS = ['SPAM', 'ABUSE', 'FRAUD', 'COPYRIGHT', 'INAPPROPRIATE', 'OTHER'] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

export class CreateReportDto {
  @ApiProperty({
    enum: REPORT_REASONS,
    description: 'SPAM 스팸·홍보 / ABUSE 욕설·괴롭힘 / FRAUD 사기·금전 요구 / COPYRIGHT 저작권 침해 / INAPPROPRIATE 부적절한 콘텐츠 / OTHER 기타',
  })
  @IsIn(REPORT_REASONS)
  reason!: ReportReasonValue;

  @ApiPropertyOptional({ maxLength: 2000, description: '구체적인 내용 (기타 사유면 필수)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @ApiPropertyOptional({ description: '신고한 위치의 대본 id (선택)' })
  @IsOptional()
  @IsString()
  scriptId?: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['RESOLVED', 'DISMISSED'], description: 'RESOLVED = 조치함, DISMISSED = 문제없음(기각)' })
  @IsIn(['RESOLVED', 'DISMISSED'])
  status!: 'RESOLVED' | 'DISMISSED';

  @ApiPropertyOptional({ maxLength: 500, description: '처리 메모' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'true면 신고된 계정을 정지하고 처리 (status=RESOLVED일 때만)' })
  @IsOptional()
  @IsBoolean()
  suspend?: boolean;
}

export class ListReportsQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatusValue;

  @ApiPropertyOptional({ description: '신고된 계정 id로 거르기' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

class ReportUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'WITHDRAWN'] }) status!: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';
}

class ReportScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

/** 신고자에게 돌려주는 접수 결과 (신고된 사람 정보는 최소한만) */
export class ReportReceiptDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: REPORT_REASONS }) reason!: ReportReasonValue;
  @ApiProperty({ enum: REPORT_STATUSES }) status!: ReportStatusValue;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AdminReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: REPORT_REASONS }) reason!: ReportReasonValue;
  @ApiProperty({ nullable: true, type: String }) details!: string | null;
  @ApiProperty({ enum: REPORT_STATUSES }) status!: ReportStatusValue;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) resolvedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) resolutionNote!: string | null;
  @ApiProperty({ type: ReportUserDto }) reporter!: ReportUserDto;
  @ApiProperty({ type: ReportUserDto }) target!: ReportUserDto;
  @ApiProperty({ type: ReportScriptDto, nullable: true }) script!: ReportScriptDto | null;
  @ApiProperty({ type: ReportUserDto, nullable: true }) resolvedBy!: ReportUserDto | null;
}

export class AdminReportPageDto {
  @ApiProperty({ type: [AdminReportDto] }) items!: AdminReportDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ReportedUserDto {
  @ApiProperty({ type: ReportUserDto }) user!: ReportUserDto;
  @ApiProperty({ description: '처리 전 신고 수' }) openCount!: number;
  @ApiProperty({ description: '전체 신고 수' }) totalCount!: number;
  @ApiProperty({ description: '신고한 서로 다른 사람 수 (처리 전)' }) openReporters!: number;
  @ApiProperty({ enum: REPORT_REASONS, isArray: true, description: '처리 전 신고 사유 (많은 순)' })
  reasons!: ReportReasonValue[];
  @ApiProperty({ format: 'date-time' }) lastReportedAt!: Date;
}
