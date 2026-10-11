import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [DealsModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
