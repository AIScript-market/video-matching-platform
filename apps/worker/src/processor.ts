import type { ScriptRepository } from './db.js';
import type { EmbedScript } from './ml-embed.js';
import { normalizeSummary, type AiSummary, type Summarizer } from './summary.js';

export const QUEUE_NAME = 'ai-jobs';
export const SUMMARIZE_JOB = 'script.summarize';

export interface SummarizeJobData {
  scriptId: string;
}

export type JobResult =
  | { status: 'done'; model: string; embedding?: 'ok' | 'failed' }
  | { status: 'skipped'; reason: string };

/**
 * "script.summarize" 작업 하나를 처리한다. 실패하면 throw해서 BullMQ가 재시도하게 한다.
 * 본문이 바뀔 때마다 오는 작업이므로 흥행 판단 모델용 벡터화도 함께 요청한다.
 * 벡터화 실패는 기록만 하고 요약 작업을 실패시키지 않는다 (관리자 화면에서 다시 만들 수 있다).
 */
export async function processSummarize(
  data: SummarizeJobData,
  deps: { scripts: ScriptRepository; summarizer: Summarizer; embed?: EmbedScript | null; now?: () => Date },
): Promise<JobResult> {
  if (!data?.scriptId) return { status: 'skipped', reason: 'scriptId 없음' };
  const script = await deps.scripts.find(data.scriptId);
  if (!script) return { status: 'skipped', reason: '대본이 삭제됨' };
  if (!script.fullText?.trim()) return { status: 'skipped', reason: '본문이 비어 있음' };

  let embedding: 'ok' | 'failed' | undefined;
  if (deps.embed) {
    embedding = await deps.embed(script.id).then(
      () => 'ok' as const,
      (err: unknown) => {
        console.warn(`[worker] 대본 ${script.id} 벡터화 실패: ${err instanceof Error ? err.message : String(err)}`);
        return 'failed' as const;
      },
    );
  }

  // 작가가 동의하지 않은 대본은 국외 AI 서비스로 보내지 않는다 (작업이 등록된 뒤 동의를 끊었을 수도 있다)
  if (!script.aiSummaryConsent) return { status: 'skipped', reason: 'AI 요약 동의 없음' };
  const content = normalizeSummary(await deps.summarizer.summarize(script));
  const summary: AiSummary = {
    ...content,
    model: deps.summarizer.model,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  if (!(await deps.scripts.saveSummary(script.id, summary))) return { status: 'skipped', reason: '요약하는 동안 동의를 끊음' };
  return { status: 'done', model: summary.model, ...(embedding && { embedding }) };
}
