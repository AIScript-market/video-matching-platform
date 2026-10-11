import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';

const INT_MAX = 2_000_000_000;

export class RecordPerformanceDto {
  @ApiProperty({ description: '이 숫자를 확인한 시각 (ISO 8601)', example: '2026-10-11T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  capturedAt!: Date;

  @ApiProperty({ description: '조회수' }) @IsInt() @Min(0) @Max(INT_MAX) views!: number;
  @ApiPropertyOptional({ description: '총 시청 시간 (분)' }) @IsOptional() @IsInt() @Min(0) @Max(INT_MAX) watchTimeMinutes?: number;
  @ApiPropertyOptional({ description: '평균 시청 지속 시간 (초)' }) @IsOptional() @IsInt() @Min(0) @Max(86_400) avgViewDurationSec?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(INT_MAX) likes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(INT_MAX) comments?: number;
  @ApiPropertyOptional({ description: '이 영상으로 늘어난 구독자' }) @IsOptional() @IsInt() @Min(0) @Max(INT_MAX) subscribersGained?: number;
  @ApiPropertyOptional({ description: '누적 수익 (원)' }) @IsOptional() @IsInt() @Min(0) @Max(INT_MAX) revenueKrw?: number;
}

export class PerformanceSnapshotDto {
  @ApiProperty() id!: string;
  @ApiProperty() workId!: string;
  @ApiProperty() capturedAt!: Date;
  @ApiProperty() views!: number;
  @ApiProperty({ nullable: true, type: Number }) watchTimeMinutes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) avgViewDurationSec!: number | null;
  @ApiProperty({ nullable: true, type: Number }) likes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) comments!: number | null;
  @ApiProperty({ nullable: true, type: Number }) subscribersGained!: number | null;
  @ApiProperty({ nullable: true, type: Number }) revenueKrw!: number | null;
  @ApiProperty({ enum: ['MANUAL', 'YOUTUBE_API'] }) source!: string;
  @ApiProperty() createdAt!: Date;
}

export class TrainingWorkDto {
  @ApiProperty() workId!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: Date | null;
  @ApiProperty({ type: PerformanceSnapshotDto, nullable: true, description: '가장 최근 성과 기록' }) latest!: PerformanceSnapshotDto | null;
  @ApiProperty({ description: '공개 후 경과 일수 (최근 기록 기준)' }) daysSincePublish!: number | null;
}

/** 학습용 한 행: 대본의 메타데이터와 그 대본으로 만든 작품의 성과. 대본 원문은 넣지 않는다 */
export class TrainingRowDto {
  @ApiProperty() scriptId!: string;
  @ApiProperty() genre!: string;
  @ApiProperty({ nullable: true, enum: ['ALL', '12', '15', '19'] }) contentRating!: string | null;
  @ApiProperty() fullTextChars!: number;
  @ApiProperty({ type: [TrainingWorkDto] }) works!: TrainingWorkDto[];
}
