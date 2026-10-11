import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export const SIGNUP_ROLES = ['WRITER', 'PRODUCER'] as const;
export const ALL_ROLES = ['WRITER', 'PRODUCER', 'ADMIN'] as const;

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

  @ApiPropertyOptional({
    enum: SIGNUP_ROLES,
    isArray: true,
    description:
      '가입과 함께 관리자에게 신청할 권한 (WRITER 대본 제공자 / PRODUCER 영상 제작자, 둘 다 가능). ' +
      '가입 직후에는 역할이 없는 일반 계정이고, 관리자가 승인하면 역할이 생긴다',
  })
  @IsOptional()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(SIGNUP_ROLES, { each: true })
  requestedRoles?: Array<(typeof SIGNUP_ROLES)[number]>;
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
  @ApiProperty({ enum: ALL_ROLES, isArray: true, description: '빈 배열이면 일반 계정' })
  roles!: Array<(typeof ALL_ROLES)[number]>;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AuthResultDto {
  @ApiProperty({ type: MeDto }) user!: MeDto;
  @ApiProperty({ description: 'Bearer 토큰. 웹은 같은 값이 httpOnly 쿠키로도 설정된다' })
  accessToken!: string;
}
