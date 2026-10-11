import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 신청할 수 있는 역할. ADMIN은 신청 대상이 아니다 */
export const REQUESTABLE_ROLES = ['WRITER', 'PRODUCER'] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];
export const ROLE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export class CreateRoleRequestDto {
  @ApiProperty({ enum: REQUESTABLE_ROLES, description: 'WRITER = 대본 제공자, PRODUCER = 영상 제작자' })
  @IsIn(REQUESTABLE_ROLES)
  role!: RequestableRole;

  @ApiPropertyOptional({ maxLength: 500, description: '관리자에게 남길 말 (경력, 포트폴리오 등)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ListRoleRequestsQueryDto {
  @ApiPropertyOptional({ enum: ROLE_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(ROLE_REQUEST_STATUSES)
  status?: (typeof ROLE_REQUEST_STATUSES)[number];
}

class RequesterDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['WRITER', 'PRODUCER', 'ADMIN'], isArray: true }) roles!: Array<'WRITER' | 'PRODUCER' | 'ADMIN'>;
}

export class RoleRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: REQUESTABLE_ROLES }) role!: RequestableRole;
  @ApiProperty({ nullable: true, type: String }) message!: string | null;
  @ApiProperty({ enum: ROLE_REQUEST_STATUSES }) status!: (typeof ROLE_REQUEST_STATUSES)[number];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true }) decidedAt!: Date | null;
  @ApiProperty({ type: RequesterDto }) user!: RequesterDto;
}
