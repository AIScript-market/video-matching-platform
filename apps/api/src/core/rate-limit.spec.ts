import { FixedWindowLimiter, rateLimitMiddleware } from './rate-limit.js';

describe('rate limit', () => {
  it('allows up to the limit per window and resets after it', () => {
    let t = 0;
    const l = new FixedWindowLimiter(() => t);
    expect(l.take('a', 2, 1000)).toBeNull();
    expect(l.take('a', 2, 1000)).toBeNull();
    expect(l.take('a', 2, 1000)).toBe(1);
    expect(l.take('b', 2, 1000)).toBeNull(); // 키마다 따로
    t = 1000;
    expect(l.take('a', 2, 1000)).toBeNull();
  });

  it('answers 429 with Retry-After only on matching routes', () => {
    const mw = rateLimitMiddleware([{ method: 'POST', path: /^\/auth\/login$/, limit: 1, windowMs: 60_000 }]);
    const calls: string[] = [];
    const res = {
      headers: {} as Record<string, string>,
      code: 0,
      setHeader(n: string, v: string) {
        this.headers[n] = v;
      },
      status(c: number) {
        this.code = c;
        return this;
      },
      json() {
        calls.push('429');
      },
    };
    const next = () => calls.push('next');
    mw({ method: 'POST', path: '/auth/login', ip: '1.1.1.1' }, res, next);
    mw({ method: 'POST', path: '/auth/login', ip: '1.1.1.1' }, res, next);
    mw({ method: 'POST', path: '/auth/login', ip: '2.2.2.2' }, res, next);
    mw({ method: 'GET', path: '/scripts', ip: '1.1.1.1' }, res, next);
    expect(calls).toEqual(['next', '429', 'next', 'next']);
    expect(res.code).toBe(429);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
  });
});
