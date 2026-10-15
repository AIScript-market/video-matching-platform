import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const ACCESS_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessStatusValue = (typeof ACCESS_STATUSES)[number];

export class CreateAccessRequestDto {
  @ApiProperty({ description: 'NDA 동의. 반드시 true', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: 'NDA에 동의해야 열람을 요청할 수 있습니다' })
  ndaAccepted!: boolean;

  @ApiPropertyOptional({ description: '서약서에 서명할 이름 (생략하면 활동명)', maxLength: 40 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(40)
  signedName?: string;
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
  @ApiPropertyOptional({ description: '이 요청과 함께 만든 비밀유지 서약서 (요청을 만들 때만 돌려준다)' }) ndaContractId?: string;
}
