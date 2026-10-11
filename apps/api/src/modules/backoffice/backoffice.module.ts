import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module.js';
import { BackofficeController } from './backoffice.controller.js';
import { BackofficeService } from './backoffice.service.js';

@Module({ imports: [MembershipModule], controllers: [BackofficeController], providers: [BackofficeService] })
export class BackofficeModule {}
