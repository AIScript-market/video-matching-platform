import { Module } from '@nestjs/common';
import { AiJobsQueue } from './ai-jobs.queue.js';
import { ScriptsController } from './scripts.controller.js';
import { ScriptsService } from './scripts.service.js';

@Module({
  controllers: [ScriptsController],
  providers: [ScriptsService, AiJobsQueue],
  exports: [ScriptsService],
})
export class ScriptsModule {}
