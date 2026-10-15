import { Module } from '@nestjs/common';
import { PerformanceController, TrainingSetController } from './performance.controller.js';
import { PerformanceService } from './performance.service.js';

@Module({
  controllers: [PerformanceController, TrainingSetController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
