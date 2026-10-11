import { Module } from '@nestjs/common';
import { BackofficeModule } from '../backoffice/backoffice.module.js';
import { AdminReportsController, ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [BackofficeModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
