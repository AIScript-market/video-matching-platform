import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type PredictionMode = 'MODEL' | 'NEIGHBORS' | 'NOT_READY' | 'NOT_EMBEDDED';

export interface MlNeighbor {
  scriptId: string;
  similarity: number;
  hit: boolean;
  percentile: number;
}

interface Readiness {
  embedder: string;
  trainingPairs: number;
  requiredPairs: number;
}

export interface MlPrediction extends Readiness {
  scriptId: string;
  mode: PredictionMode;
  modelVersion?: string;
  probability?: number;
  low?: number;
  high?: number;
  neighborSignal?: number;
  neighbors?: MlNeighbor[];
}

export interface MlRankItem {
  scriptId: string;
  score: number | null;
  probability?: number;
  low?: number;
  high?: number;
  neighbors?: MlNeighbor[];
}

export interface MlRanking extends Readiness {
  mode: PredictionMode;
  modelVersion?: string;
  items: MlRankItem[];
}

export interface MlStatus extends Readiness {
  embeddedScripts: number;
  neighborMin: number;
  sentiment: string;
  activeModel: { version: string; embedder: string; trainedAt: string; metrics: Record<string, unknown> } | null;
}

export interface MlTrainResult extends Readiness {
  status: 'TRAINED' | 'NOT_ENOUGH_DATA';
  version?: string;
  activated?: boolean;
  metrics?: Record<string, unknown>;
  note?: string;
}

export interface MlSentiment {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  version: string;
}

/**
 * 흥행 판단 모델 서비스(services/ml) 호출. 내부 네트워크 주소(ML_URL)와 토큰(ML_TOKEN)을 쓴다.
 * 테스트에서는 같은 메서드를 가진 가짜로 바꿔 끼운다.
 */
@Injectable()
export class MlClient {
  private readonly baseUrl = process.env.ML_URL?.replace(/\/$/, '') || null;
  private readonly token = process.env.ML_TOKEN || null;

  predict(scriptId: string) {
    return this.call<MlPrediction>('GET', `/predict/${encodeURIComponent(scriptId)}`);
  }

  rank(scriptIds: string[], limit: number) {
    return this.call<MlRanking>('POST', '/rank', { scriptIds, limit });
  }

  status() {
    return this.call<MlStatus>('GET', '/status');
  }

  train(forceActivate: boolean) {
    return this.call<MlTrainResult>('POST', '/train', { forceActivate }, 300_000);
  }

  embedStale() {
    return this.call<{ embedder: string; embedded: number }>('POST', '/embed-stale', undefined, 300_000);
  }

  sentiment(comments: string[]) {
    return this.call<MlSentiment>('POST', '/sentiment', { comments });
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
    if (!this.baseUrl) throw new ServiceUnavailableException('흥행 판단 모델 서비스가 설정되지 않았습니다 (ML_URL)');
    const headers: Record<string, string> = this.token ? { 'x-ml-token': this.token } : {};
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ServiceUnavailableException('흥행 판단 모델 서비스에 연결할 수 없습니다');
    }
    if (res.status === 404) throw new NotFoundException('대본을 찾을 수 없습니다');
    if (!res.ok) throw new ServiceUnavailableException(`흥행 판단 모델 서비스 오류 (${res.status})`);
    return (await res.json()) as T;
  }
}
