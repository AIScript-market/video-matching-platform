import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DealsModule } from '../deals/deals.module.js';
import { ChannelController } from './channel.controller.js';
import { ChannelService } from './channel.service.js';

@Module({
  imports: [DealsModule, ContractsModule],
  controllers: [ChannelController],
  providers: [ChannelService],
})
export class ChannelModule {}
