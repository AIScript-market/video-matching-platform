import { Injectable, Logger, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { LIKENESS_VAULT, vaultFromEnv } from './likeness-vault.js';
import { TalentAdminController, TalentController } from './talent.controller.js';
import { TalentService } from './talent.service.js';
import {
  fakeVerificationAllowed,
  FakeIdentityVerifier,
  FakeLivenessChecker,
  IDENTITY_VERIFIER,
  LIVENESS_CHECKER,
} from './verification.js';

/** 실제 본인인증·셀카 확인 provider(PASS, NICE 등)는 아직 연동하지 않았다. 운영에서는 가짜로 시작하지 않는다 */
function fakeOnly<T>(what: string, make: () => T): T {
  if (!fakeVerificationAllowed()) {
    throw new Error(`${what}: 운영용 provider가 없습니다. 시범 환경에서만 ALLOW_FAKE_VERIFICATION=true로 켜세요`);
  }
  return make();
}

/** 1시간마다: 삭제 예정일이 지난 원본 삭제, 기간이 끝난 계약 만료 */
@Injectable()
export class TalentMaintenanceScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TalentMaintenanceScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly talent: TalentService) {}

  onApplicationBootstrap() {
    if (process.env.VITEST || process.env.DISABLE_SCHEDULERS === 'true') return;
    const run = () =>
      this.talent
        .runMaintenance()
        .then((r) => {
          if (r.withdrawnAccounts || r.purgedTalents || r.expiredContracts) this.logger.log(`정리: ${JSON.stringify(r)}`);
        })
        .catch((err: Error) => this.logger.error(`정리 실패: ${err.message}`));
    void run();
    this.timer = setInterval(run, 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({
  controllers: [TalentController, TalentAdminController],
  providers: [
    TalentService,
    TalentMaintenanceScheduler,
    { provide: LIKENESS_VAULT, useFactory: () => vaultFromEnv() },
    { provide: IDENTITY_VERIFIER, useFactory: () => fakeOnly('본인인증', () => new FakeIdentityVerifier()) },
    { provide: LIVENESS_CHECKER, useFactory: () => fakeOnly('셀카 확인', () => new FakeLivenessChecker()) },
  ],
  exports: [TalentService],
})
export class TalentModule {}
