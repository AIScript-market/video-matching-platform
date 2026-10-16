import { Module } from '@nestjs/common';
import { CoreAuthModule } from './core/auth/index.js';
import { HealthModule } from './health/health.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { BackofficeModule } from './modules/backoffice/backoffice.module.js';
import { DealsModule } from './modules/deals/deals.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { NegotiationsModule } from './modules/negotiations/negotiations.module.js';
import { ScriptsModule } from './modules/scripts/scripts.module.js';
import { CastingModule } from './modules/casting/casting.module.js';
import { ChannelModule } from './modules/channel/channel.module.js';
import { ContractsModule } from './modules/contracts/contracts.module.js';
import { TalentModule } from './modules/talent/talent.module.js';
import { WorksModule } from './modules/works/works.module.js';
import { HitModelModule } from './modules/hit-model/hit-model.module.js';
import { PerformanceModule } from './modules/performance/performance.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { featureFlags } from './core/beta.js';

// 꺼진 기능의 API는 올리지 않는다: 출연자·캐스팅·작품은 FEATURE_CASTING=on일 때만, 흥행 판단은 베타가 아닐 때만 (core/beta.ts)
const features = featureFlags();
const CASTING_MODULES = [TalentModule, CastingModule, WorksModule];
const HIT_MODEL_MODULES = [PerformanceModule, HitModelModule];

@Module({
  imports: [
    PrismaModule,
    CoreAuthModule,
    HealthModule,
    IdentityModule,
    WalletModule,
    ProfilesModule,
    BackofficeModule,
    ReportsModule,
    ScriptsModule,
    AccessModule,
    NegotiationsModule,
    DealsModule,
    LedgerModule,
    ContractsModule,
    ChannelModule,
    ...(features.casting ? CASTING_MODULES : []),
    ...(features.hitModel ? HIT_MODEL_MODULES : []),
  ],
})
export class AppModule {}
