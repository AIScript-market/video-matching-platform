import { Module } from '@nestjs/common';
import { HitModelAdminController, HitModelController } from './hit-model.controller.js';
import { HitModelService } from './hit-model.service.js';
import { MlClient } from './ml.client.js';

@Module({
  controllers: [HitModelController, HitModelAdminController],
  providers: [HitModelService, MlClient],
})
export class HitModelModule {}
