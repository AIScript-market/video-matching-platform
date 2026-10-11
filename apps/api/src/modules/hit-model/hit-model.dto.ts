import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MODES = ['MODEL', 'NEIGHBORS', 'NOT_READY', 'NOT_EMBEDDED'] as const;

export class SimilarWorkDto {
  @ApiProperty() scriptId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String, description: '그 대본으로 만든 공개 작품 (첫 편)' }) workTitle!: string | null;
  @ApiProperty({ description: '벡터 코사인 유사도 (-1~1)' }) similarity!: number;
  @ApiProperty({ description: '채널 크기를 보정한 성과가 상위 20%였는가' }) hit!: boolean;
  @ApiProperty({ description: '학습 데이터 안에서의 성과 백분위 (0~1)' }) percentile!: number;
}

class ReadinessDto {
  @ApiProperty({ enum: MODES, description: 'MODEL: 모델 확률 / NEIGHBORS: 모델 학습 전, 비슷한 성공작만 / NOT_READY: 정답 데이터 부족' })
  mode!: (typeof MODES)[number];
  @ApiProperty({ description: '벡터를 만든 임베더' }) embedder!: string;
  @ApiProperty({ description: '정답(작품 성과)이 있는 학습 동의 대본 수' }) trainingPairs!: number;
  @ApiProperty({ description: '모델 학습에 필요한 수' }) requiredPairs!: number;
  @ApiPropertyOptional() modelVersion?: string;
}

export class HitInsightDto extends ReadinessDto {
  @ApiProperty() scriptId!: string;
  @ApiPropertyOptional({ description: '상위 20% 성과일 확률 (MODEL)' }) probability?: number;
  @ApiPropertyOptional({ description: '확률 범위 하단 (부트스트랩 10%)' }) low?: number;
  @ApiPropertyOptional({ description: '확률 범위 상단 (부트스트랩 90%)' }) high?: number;
  @ApiPropertyOptional({ description: '비슷한 작품의 유사도 가중 성공률 (NEIGHBORS, 참고 신호)' }) neighborSignal?: number;
  @ApiProperty({ type: [SimilarWorkDto] }) neighbors!: SimilarWorkDto[];
}

export class RecommendedScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() logline!: string;
  @ApiProperty() genre!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty({ nullable: true, type: Number, description: 'MODEL이면 확률, NEIGHBORS면 참고 신호, NOT_READY면 null' }) score!: number | null;
  @ApiPropertyOptional() probability?: number;
  @ApiPropertyOptional() low?: number;
  @ApiPropertyOptional() high?: number;
  @ApiProperty({ type: [SimilarWorkDto] }) neighbors!: SimilarWorkDto[];
}

export class RecommendationsDto extends ReadinessDto {
  @ApiProperty({ type: [RecommendedScriptDto] }) items!: RecommendedScriptDto[];
}

export class RecommendationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CommentSentimentRequestDto {
  @ApiProperty({ type: [String], maxItems: 2000, description: '유튜브 댓글 등 (저장하지 않는다)' })
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  comments!: string[];
}

export class CommentSentimentDto {
  @ApiProperty() total!: number;
  @ApiProperty() positive!: number;
  @ApiProperty() negative!: number;
  @ApiProperty() neutral!: number;
  @ApiProperty({ description: '분류기 버전' }) version!: string;
}

export class ActiveModelDto {
  @ApiProperty() version!: string;
  @ApiProperty() embedder!: string;
  @ApiProperty() trainedAt!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) metrics!: Record<string, unknown>;
}

export class MlStatusDto {
  @ApiProperty() embedder!: string;
  @ApiProperty() embeddedScripts!: number;
  @ApiProperty() trainingPairs!: number;
  @ApiProperty() requiredPairs!: number;
  @ApiProperty() neighborMin!: number;
  @ApiProperty() sentiment!: string;
  @ApiProperty({ type: ActiveModelDto, nullable: true }) activeModel!: ActiveModelDto | null;
}

export class HitModelVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: string;
  @ApiProperty() embedder!: string;
  @ApiProperty() algorithm!: string;
  @ApiProperty() labelDefinition!: string;
  @ApiProperty() trainingPairs!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) metrics!: Record<string, unknown>;
  @ApiProperty() active!: boolean;
  @ApiProperty() trainedAt!: Date;
}

export class TrainRequestDto {
  @ApiPropertyOptional({ description: '장르 평균보다 못해도 활성화한다' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  forceActivate?: boolean;
}

export class TrainResultDto {
  @ApiProperty({ enum: ['TRAINED', 'NOT_ENOUGH_DATA'] }) status!: 'TRAINED' | 'NOT_ENOUGH_DATA';
  @ApiProperty() trainingPairs!: number;
  @ApiProperty() requiredPairs!: number;
  @ApiProperty() embedder!: string;
  @ApiPropertyOptional() version?: string;
  @ApiPropertyOptional({ description: '시간 순서 검증에서 장르 평균 이상이라 활성화했는가' }) activated?: boolean;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) metrics?: Record<string, unknown>;
  @ApiPropertyOptional() note?: string;
}

export class EmbedStaleResultDto {
  @ApiProperty() embedder!: string;
  @ApiProperty() embedded!: number;
}
