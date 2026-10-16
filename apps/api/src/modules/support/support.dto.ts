import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export const INQUIRY_CATEGORIES = ['ACCOUNT', 'COINS', 'SCRIPTS', 'CONTRACTS', 'VIDEOS', 'OTHER'] as const;
export type InquiryCategoryName = (typeof INQUIRY_CATEGORIES)[number];
export const INQUIRY_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export type InquiryStatusName = (typeof INQUIRY_STATUSES)[number];

/** 비밀 문의를 볼 수 없는 사람에게 제목 대신 보이는 글 */
export const PRIVATE_TITLE = '비밀 문의입니다';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class CreateInquiryDto {
  @ApiProperty({ enum: INQUIRY_CATEGORIES })
  @IsIn(INQUIRY_CATEGORIES)
  category!: InquiryCategoryName;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100, { message: '제목은 1~100자로 써 주세요' })
  title!: string;

  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @Length(1, 5000, { message: '내용은 1~5,000자로 써 주세요' })
  body!: string;

  @ApiPropertyOptional({ description: '비밀 문의 (작성자와 운영자만 본다). 생략하면 비밀', default: true })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class CreateInquiryReplyDto {
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @Length(1, 5000, { message: '내용은 1~5,000자로 써 주세요' })
  body!: string;
}

export class HideInquiryDto {
  @ApiProperty({ description: 'true면 숨김 (운영자만 본다), false면 다시 보임' })
  @IsBoolean()
  hidden!: boolean;
}

export class ListInquiriesQueryDto {
  @ApiPropertyOptional({ description: 'true면 내가 쓴 문의만 (로그인 필요)' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ enum: INQUIRY_CATEGORIES })
  @IsOptional()
  @IsIn(INQUIRY_CATEGORIES)
  category?: InquiryCategoryName;

  @ApiPropertyOptional({ enum: INQUIRY_STATUSES })
  @IsOptional()
  @IsIn(INQUIRY_STATUSES)
  status?: InquiryStatusName;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}

export class InquirySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: INQUIRY_CATEGORIES }) category!: InquiryCategoryName;
  @ApiProperty({ description: `볼 수 없는 비밀 문의면 "${PRIVATE_TITLE}"` }) title!: string;
  @ApiProperty() isPrivate!: boolean;
  @ApiProperty({ enum: INQUIRY_STATUSES }) status!: InquiryStatusName;
  @ApiProperty({ nullable: true, type: String, description: '작성자 활동명 (볼 수 없는 비밀 문의면 null)' }) authorName!: string | null;
  @ApiProperty({ description: '내가 쓴 문의인가' }) mine!: boolean;
  @ApiProperty() replyCount!: number;
  @ApiProperty({ description: '운영자가 숨겼는가 (운영자에게만 true일 수 있다)' }) hidden!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: Date;
}

export class InquiryPageDto {
  @ApiProperty({ type: [InquirySummaryDto] }) items!: InquirySummaryDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class InquiryReplyDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: '운영자 답변인가 (아니면 작성자의 추가 질문)' }) fromStaff!: boolean;
  @ApiProperty({ description: '운영자 답변은 "운영자"' }) authorName!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class InquiryDetailDto extends InquirySummaryDto {
  @ApiProperty() body!: string;
  @ApiProperty({ type: [InquiryReplyDto] }) replies!: InquiryReplyDto[];
  @ApiProperty({ description: '답글을 달 수 있는가 (작성자·운영자)' }) canReply!: boolean;
  @ApiProperty({ description: '해결됨으로 닫을 수 있는가 (작성자·운영자, 아직 닫히지 않았을 때)' }) canClose!: boolean;
}
