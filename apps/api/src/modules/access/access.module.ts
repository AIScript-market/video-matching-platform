import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';

@Module({
  imports: [ContractsModule],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
