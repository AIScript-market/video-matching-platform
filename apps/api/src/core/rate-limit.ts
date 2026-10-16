/**
 * 운영용 요청 제한과 보안 헤더 (main.ts에서만 붙인다. 테스트는 setupApp만 써서 영향받지 않는다).
 * 베타는 서버 한 대라 메모리 고정 창으로 충분하다. 여러 대로 늘리면 Redis로 옮긴다.
 */
export interface RateRule {
  /** 이 규칙이 걸리는 요청 (메서드 + 경로 정규식) */
  method: string;
  path: RegExp;
  /** 창 하나에 허용하는 요청 수 */
  limit: number;
  windowMs: number;
}

export const RATE_RULES: RateRule[] = [
  { method: 'POST', path: /^\/auth\/(login|signup)$/, limit: 10, windowMs: 60_000 },
  { method: 'POST', path: /^\/contracts\/[^/]+\/sign$/, limit: 20, windowMs: 60_000 },
  { method: 'POST', path: /^\/scripts\/[^/]+\/access-requests$/, limit: 20, windowMs: 60_000 },
  { method: 'POST', path: /^\/negotiations\/[^/]+\/messages$/, limit: 60, windowMs: 60_000 },
  { method: 'POST', path: /^\/scripts(\/[^/]+)?\/upload$/, limit: 10, windowMs: 60_000 },
  { method: 'POST', path: /^\/inquiries(\/[^/]+\/replies)?$/, limit: 10, windowMs: 60_000 },
];

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 허용되면 null, 넘으면 다시 시도할 수 있을 때까지 남은 초 */
  take(key: string, limit: number, windowMs: number): number | null {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + windowMs });
      this.sweep(t);
      return null;
    }
    if (cur.count >= limit) return Math.max(1, Math.ceil((cur.resetAt - t) / 1000));
    cur.count += 1;
    return null;
  }

  /** 만료된 키를 가끔 지워 메모리가 계속 늘지 않게 한다 */
  private sweep(t: number): void {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

interface Req {
  method: string;
  path: string;
  ip?: string;
}
interface Res {
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  json(body: unknown): void;
}

export function rateLimitMiddleware(rules: RateRule[] = RATE_RULES, limiter = new FixedWindowLimiter()) {
  return (req: Req, res: Res, next: () => void) => {
    const rule = rules.find((r) => r.method === req.method && r.path.test(req.path));
    if (!rule) return next();
    const wait = limiter.take(`${rules.indexOf(rule)}|${req.ip ?? 'unknown'}`, rule.limit, rule.windowMs);
    if (wait === null) return next();
    res.setHeader('Retry-After', String(wait));
    res.status(429).json({ statusCode: 429, message: `요청이 너무 많습니다. ${wait}초 뒤에 다시 시도해 주세요`, error: 'TOO_MANY_REQUESTS' });
  };
}

/** API 응답에 붙이는 기본 보안 헤더 */
export function securityHeadersMiddleware() {
  return (_req: unknown, res: Res, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  };
}
