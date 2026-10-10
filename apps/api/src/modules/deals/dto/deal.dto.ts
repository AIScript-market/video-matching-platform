import { ApiProperty } from '@nestjs/swagger';
import { OfferDto, ScriptRefDto, UserRefDto } from '../../negotiations/dto/negotiation.dto';

export const DEAL_STATUSES = ['PENDING_CONTRACT', 'ACTIVE', 'TERMINATED'] as const;
export const LICENSE_STATUSES = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;

export class LicenseDto {
  @ApiProperty() id!: string;
  @ApiProperty() dealId!: string;
  @ApiProperty() scriptId!: string;
  @ApiProperty() licenseeId!: string;
  @ApiProperty() scope!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) startsAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true }) endsAt!: Date | null;
  @ApiProperty({ enum: LICENSE_STATUSES }) status!: (typeof LICENSE_STATUSES)[number];
  @ApiProperty({ nullable: true, type: String }) terminationReason!: string | null;
}

export class DealDto {
  @ApiProperty() id!: string;
  @ApiProperty() negotiationId!: string;
  @ApiProperty() acceptedOfferId!: string;
  @ApiProperty({ enum: DEAL_STATUSES }) status!: (typeof DEAL_STATUSES)[number];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: ScriptRefDto }) script!: ScriptRefDto;
  @ApiProperty({ type: UserRefDto }) writer!: UserRefDto;
  @ApiProperty({ type: UserRefDto }) producer!: UserRefDto;
  @ApiProperty({ type: OfferDto }) acceptedOffer!: OfferDto;
  @ApiProperty({ type: [LicenseDto] }) licenses!: LicenseDto[];
}
