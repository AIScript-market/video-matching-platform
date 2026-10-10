import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

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
  private redis?: Redis;

  private get q(): Queue {
    if (!this.queue) {
      // BullMQ 6은 ioredis가 선택 의존성이라 클라이언트를 직접 만들어 넘긴다
      this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      this.redis.on('error', (err) => this.logger.warn(`Redis 연결 오류: ${err.message}`));
      this.queue = new Queue(AI_JOBS_QUEUE, { connection: this.redis });
      // 리스너가 없는 'error' 이벤트는 프로세스를 죽이므로 반드시 받아서 로그만 남긴다
      this.queue.on('error', (err) => this.logger.warn(`큐 오류: ${err.message}`));
    }
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
      // 시간 초과로 포기한 뒤 늦게 실패해도 처리되지 않은 rejection이 되지 않게 한다
      added.catch(() => undefined);
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
    this.redis?.disconnect();
  }
}
