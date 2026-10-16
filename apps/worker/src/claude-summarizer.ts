import Anthropic from '@anthropic-ai/sdk';
import { RefusedError, SUMMARY_INSTRUCTIONS, summaryInput, SummaryContentSchema, type ScriptForSummary, type SummaryContent, type Summarizer } from './summary.js';

export { RefusedError };

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    contentRating: { type: 'string', enum: ['ALL', '12', '15', '19'] },
  },
  required: ['summary', 'tags', 'contentRating'],
  additionalProperties: false,
} as const;

/** Claude API로 대본을 요약한다. ANTHROPIC_API_KEY 등 SDK 기본 인증을 사용한다. */
export class ClaudeSummarizer implements Summarizer {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(model = process.env.AI_SUMMARY_MODEL ?? 'claude-opus-5-5') {
    this.model = model;
    this.client = new Anthropic();
  }

  async summarize(script: ScriptForSummary): Promise<SummaryContent> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // 정책 분류기가 거절하면 서버에서 대체 모델로 다시 실행한다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: SUMMARY_INSTRUCTIONS,
      messages: [{ role: 'user', content: summaryInput(script) }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      throw new RefusedError(
        `요약 요청이 거절되었습니다 (${response.stop_details?.category ?? 'unknown'})`,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('요약 응답이 max_tokens에서 잘렸습니다');
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return SummaryContentSchema.parse(JSON.parse(text));
  }
}
