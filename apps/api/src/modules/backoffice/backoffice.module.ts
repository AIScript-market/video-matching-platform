import { Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service.js';
import { BackofficeController } from './backoffice.controller.js';
import { BackofficeService } from './backoffice.service.js';

@Module({ controllers: [BackofficeController], providers: [BackofficeService, ActivityLogService] })
export class BackofficeModule {}
