import { Module } from '@nestjs/common';
import { TalentModule } from '../talent/talent.module.js';
import { CastingAdminController, CastingController } from './casting.controller.js';
import { CastingService } from './casting.service.js';

@Module({
  imports: [TalentModule],
  controllers: [CastingController, CastingAdminController],
  providers: [CastingService],
  exports: [CastingService],
})
export class CastingModule {}
