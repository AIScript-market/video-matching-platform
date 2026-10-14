import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const ALL_ROLES = ['WRITER', 'PRODUCER', 'ADMIN'] as const;

/** 가입은 항상 일반 계정. 관리자는 시드로만 만든다 */
export class SignupDto {
  @ApiProperty({ example: 'writer@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: '올바른 이메일을 입력하세요' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128, { message: '비밀번호는 8~128자여야 합니다' })
  password!: string;

  @ApiProperty({ maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  displayName!: string;

  @ApiProperty({ required: false, description: '베타 초대 코드 (베타에서만 필요)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteCode?: string;

  @ApiProperty({ required: false, description: '만 19세 이상 확인 (베타에서만 필요. 계약 당사자가 되므로 성인만 받는다)' })
  @IsOptional()
  @IsBoolean()
  adultConfirmed?: boolean;
}

export class LoginDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ALL_ROLES, isArray: true, description: '빈 배열이면 일반 계정, ADMIN이면 관리자' })
  roles!: Array<(typeof ALL_ROLES)[number]>;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty() profilePublic!: boolean;
  @ApiProperty() emailPublic!: boolean;
  @ApiProperty({ description: '대본 제공·영상 제작 가능 (소개 작성 + 프로필 공개)' })
  creatorReady!: boolean;
  @ApiProperty() coinBalance!: number;
}

export class AuthResultDto {
  @ApiProperty({ type: MeDto }) user!: MeDto;
  @ApiProperty({ description: 'Bearer 토큰. 웹은 같은 값이 httpOnly 쿠키로도 설정된다' })
  accessToken!: string;
}
