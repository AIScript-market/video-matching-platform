import { Module } from '@nestjs/common';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';
import { OffersService } from './offers.service';

@Module({
  controllers: [NegotiationsController],
  providers: [NegotiationsService, OffersService],
  exports: [NegotiationsService, OffersService],
})
export class NegotiationsModule {}
