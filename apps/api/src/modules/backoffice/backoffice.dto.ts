import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ALL_ROLES } from '../identity/identity.dto.js';

export class HideScriptDto {
  @ApiPropertyOptional({ default: true, description: 'false면 숨김 해제 (권리 진술이 있으면 PUBLISHED, 없으면 DRAFT)' })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ALL_ROLES, isArray: true }) roles!: Array<(typeof ALL_ROLES)[number]>;
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
