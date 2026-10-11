/** 흥행 판단 모델 서비스(services/ml)에 대본 벡터화를 요청한다. ML_URL이 없으면 null. */
export type EmbedScript = (scriptId: string) => Promise<void>;

export function createEmbedScript(
  url = process.env.ML_URL,
  token = process.env.ML_TOKEN,
): EmbedScript | null {
  if (!url) return null;
  const base = url.replace(/\/$/, '');
  return async (scriptId) => {
    const res = await fetch(`${base}/embed/${encodeURIComponent(scriptId)}`, {
      method: 'POST',
      headers: token ? { 'x-ml-token': token } : {},
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`ML 벡터화 실패 (${res.status})`);
  };
}
