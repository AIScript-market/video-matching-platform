import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ActivityLogQueryDto {
  @ApiPropertyOptional({ description: '대본 제목, 사용자 이름·이메일 검색' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export class LogUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['WRITER', 'PRODUCER', 'ADMIN'], isArray: true }) roles!: Array<'WRITER' | 'PRODUCER' | 'ADMIN'>;
}

export class LogScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

export class MessageLogDto {
  @ApiProperty() id!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty() negotiationId!: string;
  @ApiProperty({ enum: ['OPEN', 'AGREED', 'CLOSED'] }) negotiationStatus!: 'OPEN' | 'AGREED' | 'CLOSED';
  @ApiProperty({ type: LogScriptDto }) script!: LogScriptDto;
  @ApiProperty({ type: LogUserDto }) sender!: LogUserDto;
  @ApiProperty({ type: LogUserDto, description: '받는 사람 (협상의 다른 참여자)' }) recipient!: LogUserDto;
}

export class ViewLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) viewedAt!: Date;
  @ApiProperty({ type: LogScriptDto }) script!: LogScriptDto;
  @ApiProperty({ type: LogUserDto }) user!: LogUserDto;
}

export class UploadLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ enum: ['FULL', 'PREVIEW'], description: 'FULL = 대본 전문, PREVIEW = 미리보기 대본' })
  kind!: 'FULL' | 'PREVIEW';
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() charCount!: number;
  @ApiProperty({ type: LogScriptDto }) script!: LogScriptDto;
  @ApiProperty({ type: LogUserDto }) uploader!: LogUserDto;
}

export class MessageLogPageDto {
  @ApiProperty({ type: [MessageLogDto] }) items!: MessageLogDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ViewLogPageDto {
  @ApiProperty({ type: [ViewLogDto] }) items!: ViewLogDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class UploadLogPageDto {
  @ApiProperty({ type: [UploadLogDto] }) items!: UploadLogDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
