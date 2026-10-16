import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

export const FULL_TEXT_MAX = 500_000;
export const PREVIEW_MAX = 50_000;

export class CreateScriptDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiProperty({ description: '한 줄 소개', maxLength: 300 })
  @IsString()
  @Length(1, 300)
  logline!: string;

  @ApiProperty({ description: '공개 시놉시스', maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  synopsis!: string;

  @ApiProperty({ example: '스릴러', maxLength: 40 })
  @IsString()
  @Length(1, 40)
  genre!: string;

  @ApiProperty({ description: '대본 전문 (작가·승인된 제작자에게만 공개)', maxLength: FULL_TEXT_MAX })
  @IsString()
  @MaxLength(FULL_TEXT_MAX)
  fullText!: string;

  @ApiPropertyOptional({
    description: '미리보기 대본: 열람 승인 전 제작자에게 보여줄 일부분. 빈 문자열이면 미리보기 없음',
    maxLength: PREVIEW_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PREVIEW_MAX)
  previewText?: string;

  @ApiPropertyOptional({ description: '권리 보유 진술. 공개하려면 true여야 한다' })
  @IsOptional()
  @IsBoolean()
  rightsDeclared?: boolean;

  @ApiPropertyOptional({
    description: '흥행 판단 모델의 학습 데이터로 이 대본(의 벡터)을 써도 된다는 동의 (선택). 언제든 철회할 수 있다',
  })
  @IsOptional()
  @IsBoolean()
  trainingConsent?: boolean;

}

export class UpdateScriptDto extends PartialType(CreateScriptDto) {}

export class PublishScriptDto {
  @ApiPropertyOptional({
    description: '아직 권리 보유를 진술하지 않았다면 여기서 true로 함께 진술할 수 있다',
  })
  @IsOptional()
  @IsBoolean()
  rightsDeclared?: boolean;
}

export class ListScriptsQueryDto {
  @ApiPropertyOptional({ description: '장르 필터' })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: '제목·로그라인 검색어' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'true면 내가 쓴 대본 전체(비공개 포함). 로그인 필요' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}

export class AuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

export class AiSummaryDto {
  @ApiProperty() summary!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ enum: ['ALL', '12', '15', '19'] }) contentRating!: 'ALL' | '12' | '15' | '19';
  @ApiProperty() model!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export const SCRIPT_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;

export class ScriptSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() logline!: string;
  @ApiProperty() synopsis!: string;
  @ApiProperty() genre!: string;
  @ApiProperty({ enum: SCRIPT_STATUSES }) status!: (typeof SCRIPT_STATUSES)[number];
  @ApiProperty({ type: AiSummaryDto, nullable: true, description: '공개 소개 글(로그라인·시놉시스)로 만든 요약' }) aiSummary!: AiSummaryDto | null;
  @ApiProperty({ description: '내용이 바뀌어 새 AI 요약을 만드는 중' }) aiSummaryPending!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '마지막 AI 요약 요청 시각' })
  aiSummaryRequestedAt!: Date | null;
  @ApiProperty({ format: 'date-time', description: '내용(제목·로그라인·시놉시스·장르·전문·미리보기)이 마지막으로 바뀐 시각' })
  contentUpdatedAt!: Date;
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class ScriptListDto {
  @ApiProperty({ type: [ScriptSummaryDto] }) items!: ScriptSummaryDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ViewerAccessDto {
  @ApiProperty() isAuthor!: boolean;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'], nullable: true })
  accessRequestStatus!: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  @ApiProperty() canReadFullText!: boolean;
  @ApiProperty() canReadPreview!: boolean;
  @ApiProperty({ description: '코인으로 미리보기 열람권을 샀는지' }) previewUnlocked!: boolean;
}

export class ScriptDetailDto extends ScriptSummaryDto {
  @ApiProperty() rightsDeclared!: boolean;
  @ApiProperty({ description: '학습 데이터 활용 동의 (작가 본인에게만 의미 있음)' }) trainingConsent!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) rightsDeclaredAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, description: '권한이 없으면 null' })
  fullText!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '미리보기 대본. 없거나 볼 권한(작가 본인·열람권)이 없으면 null' })
  previewText!: string | null;
  @ApiProperty({ description: '이 대본에 미리보기가 있는지 (열람권 구매 전에도 알 수 있음)' })
  previewAvailable!: boolean;
  @ApiProperty({ type: ViewerAccessDto }) viewer!: ViewerAccessDto;
}

