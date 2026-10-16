// openapi.json 생성: pnpm --filter api openapi
// 서버를 띄우지 않고 Nest 앱을 초기화해 문서만 만든다 (DB 연결 불필요).
// 데코레이터 메타데이터가 필요해서 tsx가 아니라 tsc로 컴파일해 실행한다.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { buildOpenApi, setupApp } from './setup-app.js';

// 문서와 웹 타입에는 꺼 둔 기능(캐스팅·흥행 판단)까지 모두 넣는다. 모듈 목록은 가져올 때 정해지므로 환경을 먼저 정한다
process.env.FEATURE_CASTING = 'on';
delete process.env.BETA_MODE;
const { AppModule } = await import('./app.module.js');
const app = await NestFactory.create(AppModule, { logger: false });
setupApp(app);
const out = resolve(process.cwd(), process.argv[2] ?? 'openapi.json');
writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
await app.close();
console.log(`openapi.json 생성: ${out}`);
