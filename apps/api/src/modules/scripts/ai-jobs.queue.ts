import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export const AI_JOBS_QUEUE = 'ai-jobs';
export const SUMMARIZE_JOB = 'script.summarize';

/**
 * 계약: BullMQ 큐 "ai-jobs", 작업 "script.summarize" {scriptId}. 처리는 apps/worker.
 * 큐 등록 실패(Redis 미기동 등)는 요청을 실패시키지 않고 로그만 남긴다.
 */
@Injectable()
export class AiJobsQueue implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobsQueue.name);
  private queue?: Queue;

  private get q(): Queue {
    this.queue ??= new Queue(AI_JOBS_QUEUE, {
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    });
    return this.queue;
  }

  async enqueueSummarize(scriptId: string): Promise<boolean> {
    if (process.env.AI_JOBS_DISABLED === 'true') return false;
    try {
      const added = this.q.add(
        SUMMARIZE_JOB,
        { scriptId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
      // Redis가 내려가 있으면 add()가 연결될 때까지 기다리므로 요청이 멈추지 않게 시간 제한을 둔다
      await Promise.race([
        added,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis 응답 시간 초과')), 3_000).unref(),
        ),
      ]);
      return true;
    } catch (err) {
      this.logger.warn(`요약 작업 등록 실패 (scriptId=${scriptId}): ${(err as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
