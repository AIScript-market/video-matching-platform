import { Module } from '@nestjs/common';
import { CoreAuthModule } from './core/auth/index.js';
import { HealthModule } from './health/health.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { BackofficeModule } from './modules/backoffice/backoffice.module.js';
import { DealsModule } from './modules/deals/deals.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { NegotiationsModule } from './modules/negotiations/negotiations.module.js';
import { ScriptsModule } from './modules/scripts/scripts.module.js';
import { CastingModule } from './modules/casting/casting.module.js';
import { TalentModule } from './modules/talent/talent.module.js';
import { WorksModule } from './modules/works/works.module.js';
import { PerformanceModule } from './modules/performance/performance.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    CoreAuthModule,
    HealthModule,
    IdentityModule,
    WalletModule,
    ProfilesModule,
    BackofficeModule,
    ScriptsModule,
    AccessModule,
    NegotiationsModule,
    DealsModule,
    LedgerModule,
    TalentModule,
    CastingModule,
    WorksModule,
    PerformanceModule,
  ],
})
export class AppModule {}
