import type { SignatureMeta } from './contracts.service.js';

export interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** 서명 증거로 남길 접속 정보. 운영에서 프록시 뒤라면 app.set('trust proxy', ...)를 켜야 req.ip가 실제 주소가 된다 */
export function signatureMeta(req: RequestLike): SignatureMeta {
  const ua = req.headers['user-agent'];
  return { ip: req.ip || null, userAgent: (Array.isArray(ua) ? ua[0] : ua) ?? null };
}
