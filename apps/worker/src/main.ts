import { UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import { ClaudeSummarizer, RefusedError } from './claude-summarizer.js';
import { ScriptRepository } from './db.js';
import { createEmbedScript } from './ml-embed.js';
import { MockSummarizer } from './mock-summarizer.js';
import { processSummarize, QUEUE_NAME, SUMMARIZE_JOB, type SummarizeJobData } from './processor.js';
import type { Summarizer } from './summary.js';

/** AI_SUMMARIZER=claude|mock. 지정하지 않으면 API 키가 있을 때만 claude. */
function createSummarizer(): Summarizer {
  const mode = process.env.AI_SUMMARIZER;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (mode === 'claude' || (mode !== 'mock' && hasKey)) return new ClaudeSummarizer();
  return new MockSummarizer();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL이 필요합니다');
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ 6은 ioredis가 선택 의존성이고, ESM에서는 미리 만든 클라이언트를 넘겨야 한다
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const pool = new pg.Pool({ connectionString: databaseUrl });
const scripts = new ScriptRepository(pool);
const summarizer = createSummarizer();
const embed = createEmbedScript();

const worker = new Worker<SummarizeJobData>(
  QUEUE_NAME,
  async (job) => {
    if (job.name !== SUMMARIZE_JOB) {
      throw new UnrecoverableError(`알 수 없는 작업: ${job.name}`);
    }
    try {
      return await processSummarize(job.data, { scripts, summarizer, embed });
    } catch (err) {
      // 정책 거절은 재시도해도 같은 결과이므로 바로 실패 처리
      if (err instanceof RefusedError) throw new UnrecoverableError(err.message);
      throw err;
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) },
);

worker.on('completed', (job, result) =>
  console.log(`[worker] ${job.name} ${job.id} ${JSON.stringify(result)}`),
);
worker.on('failed', (job, err) =>
  console.error(`[worker] ${job?.name} ${job?.id} 실패 (시도 ${job?.attemptsMade}): ${err.message}`),
);
console.log(`[worker] "${QUEUE_NAME}" 대기 중 (summarizer=${summarizer.model}, ml=${embed ? "on" : "off"})`);

async function shutdown() {
  await worker.close();
  await pool.end();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
