import { Module } from '@nestjs/common';
import { BackofficeController } from './backoffice.controller.js';
import { BackofficeService } from './backoffice.service.js';

@Module({ controllers: [BackofficeController], providers: [BackofficeService] })
export class BackofficeModule {}
