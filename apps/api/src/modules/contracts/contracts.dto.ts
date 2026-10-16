import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsString, Length } from 'class-validator';

export const CONTRACT_KINDS = ['NDA', 'SCRIPT_LICENSE', 'CHANNEL_PUBLISHING'] as const;
export const CONTRACT_STATUSES = ['AWAITING_SIGNATURES', 'SIGNED', 'VOID'] as const;
export const PARTY_ROLES = ['WRITER', 'PRODUCER', 'PLATFORM'] as const;

export class ContractPartyDto {
  @ApiProperty({ enum: PARTY_ROLES }) role!: (typeof PARTY_ROLES)[number];
  @ApiProperty({ nullable: true, type: String }) userId!: string | null;
  @ApiProperty({ description: '계약서에 적힌 이름' }) legalName!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String, description: '서명할 때 직접 입력한 이름' }) signedName!: string | null;
}

export class ContractSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CONTRACT_KINDS }) kind!: (typeof CONTRACT_KINDS)[number];
  @ApiProperty() templateVersion!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: CONTRACT_STATUSES }) status!: (typeof CONTRACT_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String }) dealId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) signedAt!: Date | null;
  @ApiProperty({ type: [ContractPartyDto] }) parties!: ContractPartyDto[];
  @ApiProperty({ description: '내가 아직 서명해야 하는가' }) awaitingMySignature!: boolean;
}

export class ContractDto extends ContractSummaryDto {
  @ApiProperty({ description: '고정된 계약서 본문 (마크다운)' }) body!: string;
  @ApiProperty({ description: '본문 SHA-256 (hex)' }) bodySha256!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) voidedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty({ description: '서명 화면에 보여 줄 동의 문구' }) signConsent!: string;
}

export class ContractPreviewDto {
  @ApiProperty() templateVersion!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() signConsent!: string;
}

export class SignContractDto {
  @ApiProperty({ description: '서명자가 직접 입력한 이름 (계약서에 적힌 이름과 같아야 한다)', maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 40)
  signedName!: string;

  @ApiProperty({ description: '동의 문구에 동의. 반드시 true', enum: [true] })
  @IsBoolean()
  @Equals(true, { message: '계약 내용에 동의해야 서명할 수 있습니다' })
  agreed!: boolean;
}

export class VoidContractDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
