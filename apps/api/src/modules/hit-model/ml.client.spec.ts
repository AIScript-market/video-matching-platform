import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MlClient } from './ml.client.js';

function withEnv(url: string | undefined, token: string | undefined) {
  vi.stubEnv('ML_URL', url ?? '');
  vi.stubEnv('ML_TOKEN', token ?? '');
  return new MlClient();
}

describe('MlClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('토큰 헤더와 JSON 본문을 붙여 내부 주소로 보낸다', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ mode: 'MODEL', items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = withEnv('http://ml:8000/', 'secret');
    await client.rank(['a', 'b'], 5);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ml:8000/rank');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-ml-token': 'secret', 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ scriptIds: ['a', 'b'], limit: 5 });
  });

  it('주소가 없거나 연결이 안 되면 503, 대본이 없으면 404', async () => {
    await expect(withEnv(undefined, undefined).status()).rejects.toBeInstanceOf(ServiceUnavailableException);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(withEnv('http://ml:8000', undefined).status()).rejects.toBeInstanceOf(ServiceUnavailableException);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await expect(withEnv('http://ml:8000', undefined).predict('x')).rejects.toBeInstanceOf(NotFoundException);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await expect(withEnv('http://ml:8000', undefined).predict('x')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
