import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  imports: [DealsModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
