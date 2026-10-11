import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ALL_ROLES } from '../identity/identity.dto.js';

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'WITHDRAWN'] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

export class HideScriptDto {
  @ApiPropertyOptional({ default: true, description: 'false면 숨김 해제 (권리 진술이 있으면 PUBLISHED, 없으면 DRAFT)' })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatusValue;

  @ApiPropertyOptional({ description: '이름·이메일 검색' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'], description: 'SUSPENDED = 정지, ACTIVE = 정지 해제' })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';

  @ApiPropertyOptional({ maxLength: 200, description: '정지 사유 (정지할 때)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ALL_ROLES, isArray: true }) roles!: Array<(typeof ALL_ROLES)[number]>;
  @ApiProperty({ enum: USER_STATUSES }) status!: UserStatusValue;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) suspendedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) suspendReason!: string | null;
  @ApiProperty() profilePublic!: boolean;
  @ApiProperty() emailPublic!: boolean;
  @ApiProperty() coinBalance!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ description: '작성한 대본 수' }) scriptCount!: number;
}

export class AdminScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() genre!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'HIDDEN'] }) status!: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  @ApiProperty() rightsDeclared!: boolean;
  @ApiProperty() authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}
