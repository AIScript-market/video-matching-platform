import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsEmail,
  IsIn,
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

  @ApiProperty({
    enum: SIGNUP_ROLES,
    isArray: true,
    description: '작가·제작자 중 하나 이상 (둘 다 가능). ADMIN은 가입으로 얻을 수 없다',
  })
  @ArrayMinSize(1, { message: '역할을 하나 이상 선택하세요' })
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(SIGNUP_ROLES, { each: true })
  roles!: Array<(typeof SIGNUP_ROLES)[number]>;
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
  @ApiProperty({ enum: ALL_ROLES, isArray: true }) roles!: Array<(typeof ALL_ROLES)[number]>;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AuthResultDto {
  @ApiProperty({ type: MeDto }) user!: MeDto;
  @ApiProperty({ description: 'Bearer 토큰. 웹은 같은 값이 httpOnly 쿠키로도 설정된다' })
  accessToken!: string;
}
