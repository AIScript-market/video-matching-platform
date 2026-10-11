import { Module } from '@nestjs/common';
import { NegotiationsController } from './negotiations.controller.js';
import { NegotiationsService } from './negotiations.service.js';
import { OffersService } from './offers.service.js';

@Module({
  controllers: [NegotiationsController],
  providers: [NegotiationsService, OffersService],
  exports: [NegotiationsService, OffersService],
})
export class NegotiationsModule {}
