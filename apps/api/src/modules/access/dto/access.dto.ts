import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsOptional } from 'class-validator';

export const ACCESS_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessStatusValue = (typeof ACCESS_STATUSES)[number];

export class CreateAccessRequestDto {
  @ApiProperty({ description: 'NDA 동의. 반드시 true', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: 'NDA에 동의해야 열람을 요청할 수 있습니다' })
  ndaAccepted!: boolean;
}

export class ListAccessRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ['writer', 'producer'],
    description: 'writer: 내 대본에 들어온 요청, producer: 내가 보낸 요청. 생략하면 둘 다',
  })
  @IsOptional()
  @IsIn(['writer', 'producer'])
  as?: 'writer' | 'producer';

  @ApiPropertyOptional({ enum: ACCESS_STATUSES })
  @IsOptional()
  @IsIn(ACCESS_STATUSES)
  status?: AccessStatusValue;
}

class AccessScriptDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() authorId!: string;
}

class AccessProducerDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

export class AccessRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() scriptId!: string;
  @ApiProperty() producerId!: string;
  @ApiProperty({ enum: ACCESS_STATUSES }) status!: AccessStatusValue;
  @ApiProperty({ format: 'date-time' }) ndaAcceptedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: Date | null;
  @ApiProperty({ type: AccessScriptDto }) script!: AccessScriptDto;
  @ApiProperty({ type: AccessProducerDto }) producer!: AccessProducerDto;
}
