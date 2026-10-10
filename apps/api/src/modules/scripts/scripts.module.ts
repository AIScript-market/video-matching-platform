import { Module } from '@nestjs/common';
import { AiJobsQueue } from './ai-jobs.queue';
import { ScriptsController } from './scripts.controller';
import { ScriptsService } from './scripts.service';

@Module({
  controllers: [ScriptsController],
  providers: [ScriptsService, AiJobsQueue],
  exports: [ScriptsService],
})
export class ScriptsModule {}
