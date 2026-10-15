import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const VIDEO_STATUSES = ['SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REMOVED'] as const;
export type VideoStatusName = (typeof VIDEO_STATUSES)[number];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** 제출할 때 제작자가 확인하는 권리 항목 (채널 게시 계약 제7조). 모두 true여야 제출할 수 있다 */
export class RightsChecklistDto {
  @ApiProperty({ description: '쓴 음원은 모두 이용 권한이 있다', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '음원 이용 권한을 확인해야 제출할 수 있습니다' })
  musicCleared!: boolean;

  @ApiProperty({ description: '영상·이미지·폰트 등 소재는 모두 이용 권한이 있다', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '소재 이용 권한을 확인해야 제출할 수 있습니다' })
  materialsCleared!: boolean;

  @ApiProperty({ description: '출연자 전원의 출연·초상 이용 동의를 받았다', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '출연자 동의를 확인해야 제출할 수 있습니다' })
  performersConsented!: boolean;

  @ApiProperty({ description: '광고가 있으면 "유료 광고 포함"을 표시했다 (없으면 없음을 확인)', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '광고 표시를 확인해야 제출할 수 있습니다' })
  adDisclosureChecked!: boolean;

  @ApiProperty({ description: '영상에 유료 광고(협찬·PPL)가 들어 있는가' })
  @IsBoolean()
  containsPaidPromotion!: boolean;

  @ApiPropertyOptional({ description: '음원·소재 출처 (곡명·라이선스 등)', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sources?: string;
}

export class SubmitVideoDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ description: '검수용 영상 위치 (비공개 링크 등, https)' })
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'https로 시작하는 영상 링크를 입력하세요' })
  @MaxLength(500)
  sourceUrl!: string;

  @ApiProperty({ type: RightsChecklistDto })
  @ValidateNested()
  @Type(() => RightsChecklistDto)
  rights!: RightsChecklistDto;
}

export class ReviewVideoDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ maxLength: 1000, description: '거절하면 이유 (제작자에게 보인다)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class PublishVideoDto {
  @ApiProperty({ description: '게시한 장르 채널 이름', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  channelName!: string;

  @ApiProperty({ description: 'YouTube 영상 번호 (11자, watch?v= 뒤)' })
  @Transform(trim)
  @Matches(/^[A-Za-z0-9_-]{11}$/, { message: 'YouTube 영상 번호는 11자입니다 (watch?v= 뒤 부분)' })
  youtubeVideoId!: string;
}

export class RemoveVideoDto {
  @ApiProperty({ maxLength: 1000, description: '내린 이유 (제작자에게 보인다)' })
  @IsString()
  @Length(1, 1000)
  note!: string;
}

export class RecordRevenueDto {
  @ApiProperty({ description: '정산 월 YYYY-MM (끝난 달만)', example: '2026-09' })
  @IsString()
  month!: string;

  @ApiProperty({ description: 'YouTube가 확정한 그 달 광고 수익 (원)', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  amountKrw!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class RecordPayoutDto {
  @ApiProperty({ enum: ['WRITER', 'PRODUCER'] })
  @IsIn(['WRITER', 'PRODUCER'])
  role!: 'WRITER' | 'PRODUCER';

  @ApiPropertyOptional({ description: '지급한 시각 (생략하면 지금)' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class ListVideosQueryDto {
  @ApiPropertyOptional({ enum: VIDEO_STATUSES })
  @IsOptional()
  @IsIn(VIDEO_STATUSES)
  status?: VideoStatusName;
}

export class ChannelVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() dealId!: string;
  @ApiProperty() producerId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() sourceUrl!: string;
  @ApiProperty({ type: RightsChecklistDto }) rightsChecklist!: RightsChecklistDto;
  @ApiProperty({ enum: VIDEO_STATUSES }) status!: VideoStatusName;
  @ApiProperty({ nullable: true, type: String }) reviewNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reviewedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) channelName!: string | null;
  @ApiProperty({ nullable: true, type: String }) youtubeVideoId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ description: '딜의 대본 제목' }) scriptTitle!: string;
}

export class PayoutDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['WRITER', 'PRODUCER'] }) role!: 'WRITER' | 'PRODUCER';
  @ApiProperty() amountKrw!: number;
  @ApiProperty({ format: 'date-time' }) paidAt!: Date;
  @ApiProperty({ nullable: true, type: String }) memo!: string | null;
}

export class RevenueLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() videoId!: string;
  @ApiProperty() videoTitle!: string;
  @ApiProperty() month!: string;
  @ApiProperty({ description: '확정 광고 수익 (원)' }) amountKrw!: number;
  @ApiProperty() writerKrw!: number;
  @ApiProperty() producerKrw!: number;
  @ApiProperty({ description: '플랫폼 몫은 언제나 0 (채널 게시 계약 제3조)' }) platformKrw!: number;
  @ApiProperty({ type: [PayoutDto] }) payouts!: PayoutDto[];
}

export class SettlementDto {
  @ApiProperty() dealId!: string;
  @ApiProperty() writerSharePct!: number;
  @ApiProperty() producerSharePct!: number;
  @ApiProperty({ type: [RevenueLineDto] }) lines!: RevenueLineDto[];
  @ApiProperty() totalRevenueKrw!: number;
  @ApiProperty() writerDueKrw!: number;
  @ApiProperty() producerDueKrw!: number;
  @ApiProperty() writerPaidKrw!: number;
  @ApiProperty() producerPaidKrw!: number;
}
