import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController, ConfigController],
})
export class HealthModule {}
