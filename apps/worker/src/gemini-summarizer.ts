import {
  RefusedError,
  SUMMARY_INSTRUCTIONS,
  summaryInput,
  SummaryContentSchema,
  type ScriptForSummary,
  type SummaryContent,
  type Summarizer,
} from './summary.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Gemini 구조화 출력 스키마 (OpenAPI 부분집합) */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    contentRating: { type: 'STRING', enum: ['ALL', '12', '15', '19'] },
  },
  required: ['summary', 'tags', 'contentRating'],
  propertyOrdering: ['summary', 'tags', 'contentRating'],
} as const;

/** 스릴러·범죄극 대본을 요약하므로 아주 심한 경우만 막는다 (대본은 창작물이다) */
const SAFETY_SETTINGS = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(
  (category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }),
);

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Gemini API(generateContent)로 대본을 요약한다. GEMINI_API_KEY가 필요하다.
 * 결제가 연결된 Cloud 프로젝트의 키여야 유료 서비스 약관(보낸 내용을 제품 개선에 쓰지 않음)이 적용된다 (docs/deploy.md).
 */
export class GeminiSummarizer implements Summarizer {
  readonly model: string;

  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY ?? '',
    model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error('GEMINI_API_KEY가 필요합니다');
    this.model = model;
  }

  async summarize(script: ScriptForSummary): Promise<SummaryContent> {
    const res = await this.fetchImpl(`${API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      // 키는 주소가 아니라 헤더로 보낸다 (로그에 남지 않게)
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SUMMARY_INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: summaryInput(script) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 8192 },
        safetySettings: SAFETY_SETTINGS,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      // 잘못된 요청·권한 문제는 재시도해도 같다
      const message = `Gemini 요청 실패: HTTP ${res.status} ${body.error?.status ?? ''} ${body.error?.message ?? ''}`.trim();
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw new RefusedError(message);
      throw new Error(message);
    }
    if (body.promptFeedback?.blockReason) throw new RefusedError(`요약 요청이 거절되었습니다 (${body.promptFeedback.blockReason})`);
    const candidate = body.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST' || finish === 'RECITATION') {
      throw new RefusedError(`요약 요청이 거절되었습니다 (${finish})`);
    }
    if (finish === 'MAX_TOKENS') throw new Error('요약 응답이 최대 길이에서 잘렸습니다');
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new Error(`Gemini 응답이 비어 있습니다 (${finish ?? '이유 없음'})`);
    return SummaryContentSchema.parse(JSON.parse(text));
  }
}
