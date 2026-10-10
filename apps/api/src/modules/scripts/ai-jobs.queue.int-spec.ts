/** REDIS_URL이 있을 때만 실행. 큐 등록과 Redis 장애 시 시간 제한을 확인한다. */
import { AiJobsQueue } from './ai-jobs.queue';

const run = process.env.REDIS_URL ? describe : describe.skip;

run('AiJobsQueue (Redis)', () => {
  const original = process.env.REDIS_URL;
  afterEach(() => {
    process.env.REDIS_URL = original;
  });

  it('Redis가 살아 있으면 작업을 등록한다', async () => {
    const queue = new AiJobsQueue();
    await expect(queue.enqueueSummarize('script-1')).resolves.toBe(true);
    await queue.onModuleDestroy();
  });

  it('Redis가 없으면 요청을 막지 않고 false를 돌려준다', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const queue = new AiJobsQueue();
    const started = Date.now();
    await expect(queue.enqueueSummarize('script-1')).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(5_000);
    await queue.onModuleDestroy();
  });
});
