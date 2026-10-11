import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: '공개 프로필 소개 (경력, 작품, 관심 장르 등)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ description: '프로필 공개. 공개하려면 소개가 있어야 한다' })
  @IsOptional()
  @IsBoolean()
  profilePublic?: boolean;

  @ApiPropertyOptional({ description: '공개 프로필에 이메일 표시' })
  @IsOptional()
  @IsBoolean()
  emailPublic?: boolean;
}

export class WithdrawDto {
  @ApiProperty({ description: '본인 확인용 비밀번호' })
  @IsString()
  @MaxLength(128)
  password!: string;
}

class ProfileScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() genre!: string;
  @ApiProperty() logline!: string;
}

export class PublicProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String, description: '이메일 공개 시에만' }) email!: string | null;
  @ApiProperty() profilePublic!: boolean;
  @ApiProperty() emailPublic!: boolean;
  @ApiProperty({ description: '대본 제공·영상 제작 가능 (프로필·이메일 공개)' }) creatorReady!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: [ProfileScriptDto], description: '공개 대본' }) scripts!: ProfileScriptDto[];
}
