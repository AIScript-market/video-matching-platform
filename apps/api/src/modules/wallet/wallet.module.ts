import { Global, Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/** 메시지·미리보기·업로드 등 여러 모듈이 코인을 쓰므로 전역으로 제공한다 */
@Global()
@Module({ controllers: [WalletController], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
