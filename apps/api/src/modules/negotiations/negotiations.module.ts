import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { NegotiationsController } from './negotiations.controller.js';
import { NegotiationsService } from './negotiations.service.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [NegotiationsController],
  providers: [NegotiationsService, OffersService],
  exports: [NegotiationsService, OffersService],
})
export class NegotiationsModule {}
