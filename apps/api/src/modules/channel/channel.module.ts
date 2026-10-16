import { Module } from '@nestjs/common';
import { createVideoStorage, VIDEO_STORAGE } from '../../core/video-storage.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DealsModule } from '../deals/deals.module.js';
import { ChannelController } from './channel.controller.js';
import { ChannelService } from './channel.service.js';

@Module({
  imports: [DealsModule, ContractsModule],
  controllers: [ChannelController],
  providers: [ChannelService, { provide: VIDEO_STORAGE, useFactory: () => createVideoStorage() }],
})
export class ChannelModule {}
