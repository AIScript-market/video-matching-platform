/**
 * 영상 저장소 설정을 확인한다: 작은 시험 파일을 서명 주소로 올리고, 크기를 확인하고, 서명 주소로 받고, 지운다.
 * 서버가 저장소에 닿는지와 키 권한을 본다 (브라우저 CORS는 가입 후 영상 제출 화면에서 확인한다).
 *   개발: docker compose -f ops/compose.yaml exec api pnpm --filter api storage:check
 *   운영: docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env run --rm api node apps/api/dist/cli/check-video-storage.js
 * 서버에서 돌리므로 서명도 내부 주소(VIDEO_STORAGE_ENDPOINT)로 한다. 브라우저용 주소는 R2에서는 같은 주소다.
 */
import { randomUUID } from 'node:crypto';
import { createVideoStorage, videoStorageConfig } from '../core/video-storage.js';

async function main() {
  const config = videoStorageConfig();
  if (!config) throw new Error('VIDEO_STORAGE_ENDPOINT·BUCKET·ACCESS_KEY_ID·SECRET_ACCESS_KEY가 설정되지 않았습니다');
  const storage = createVideoStorage({ ...process.env, VIDEO_STORAGE_PUBLIC_ENDPOINT: config.endpoint });
  const key = `checks/${randomUUID()}/check.mp4`;
  const body = new TextEncoder().encode(`storage check ${new Date().toISOString()}`);

  const put = await storage.presignUpload(key, 'video/mp4', body.byteLength);
  const up = await fetch(put.url, { method: 'PUT', headers: put.headers, body });
  if (!up.ok) throw new Error(`올리기 실패: HTTP ${up.status} ${await up.text()}`);
  console.log(`1. 서명 주소로 올리기: 성공 (${config.endpoint}, 버킷 ${config.bucket})`);

  const stat = await storage.stat(key);
  if (stat?.sizeBytes !== body.byteLength) throw new Error(`크기 확인 실패: ${JSON.stringify(stat)}`);
  console.log(`2. 크기 확인: ${stat.sizeBytes}바이트`);

  const get = await storage.presignDownload(key, '확인.mp4', true);
  const down = await fetch(get.url);
  if (!down.ok || (await down.arrayBuffer()).byteLength !== body.byteLength) throw new Error(`받기 실패: HTTP ${down.status}`);
  console.log(`3. 서명 주소로 받기: 성공 (${down.headers.get('content-disposition') ?? '파일 이름 헤더 없음'})`);

  await storage.remove(key);
  if (await storage.stat(key)) throw new Error('지우기 실패: 파일이 남아 있습니다');
  console.log('4. 지우기: 성공. 영상 저장소 설정이 맞습니다.');
}

await main();
