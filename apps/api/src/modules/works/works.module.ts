import { Module } from '@nestjs/common';
import { CastingModule } from '../casting/casting.module.js';
import { WorksAdminController, WorksController } from './works.controller.js';
import { WorksService } from './works.service.js';

@Module({
  imports: [CastingModule],
  controllers: [WorksController, WorksAdminController],
  providers: [WorksService],
})
export class WorksModule {}
