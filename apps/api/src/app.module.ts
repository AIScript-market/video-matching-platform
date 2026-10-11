import { Module } from '@nestjs/common';
import { CoreAuthModule } from './core/auth/index.js';
import { HealthModule } from './health/health.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { BackofficeModule } from './modules/backoffice/backoffice.module.js';
import { DealsModule } from './modules/deals/deals.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { NegotiationsModule } from './modules/negotiations/negotiations.module.js';
import { ScriptsModule } from './modules/scripts/scripts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    CoreAuthModule,
    HealthModule,
    IdentityModule,
    BackofficeModule,
    ScriptsModule,
    AccessModule,
    NegotiationsModule,
    DealsModule,
    LedgerModule,
  ],
})
export class AppModule {}
