import type { ScriptRepository } from './db.js';
import { normalizeSummary, type AiSummary, type Summarizer } from './summary.js';

export const QUEUE_NAME = 'ai-jobs';
export const SUMMARIZE_JOB = 'script.summarize';

export interface SummarizeJobData {
  scriptId: string;
}

export type JobResult = { status: 'done'; model: string } | { status: 'skipped'; reason: string };

/** "script.summarize" 작업 하나를 처리한다. 실패하면 throw해서 BullMQ가 재시도하게 한다. */
export async function processSummarize(
  data: SummarizeJobData,
  deps: { scripts: ScriptRepository; summarizer: Summarizer; now?: () => Date },
): Promise<JobResult> {
  if (!data?.scriptId) return { status: 'skipped', reason: 'scriptId 없음' };
  const script = await deps.scripts.find(data.scriptId);
  if (!script) return { status: 'skipped', reason: '대본이 삭제됨' };
  if (!script.fullText?.trim()) return { status: 'skipped', reason: '본문이 비어 있음' };

  const content = normalizeSummary(await deps.summarizer.summarize(script));
  const summary: AiSummary = {
    ...content,
    model: deps.summarizer.model,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  await deps.scripts.saveSummary(script.id, summary);
  return { status: 'done', model: summary.model };
}
