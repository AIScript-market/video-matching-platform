import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { betaConfig } from './core/beta.js';
import { rateLimitMiddleware, securityHeadersMiddleware } from './core/rate-limit.js';
import { buildOpenApi, setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const production = process.env.NODE_ENV === 'production';
  // 리버스 프록시(Caddy 등) 뒤에서 실제 접속 IP를 읽는다. 서명 기록과 요청 제한이 이 값을 쓴다
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(securityHeadersMiddleware());
  // 운영에서는 기본으로 켜고(RATE_LIMIT=off로 끔), 개발·e2e에서는 RATE_LIMIT=on일 때만 (한 IP로 여러 계정을 연달아 만들기 때문)
  if (process.env.RATE_LIMIT === 'on' || (production && process.env.RATE_LIMIT !== 'off')) app.use(rateLimitMiddleware());
  setupApp(app);
  // 웹(apps/studio)은 Next.js rewrite로 같은 출처에서 부르므로 CORS는 직접 호출용
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  // 운영에서는 API 문서를 공개하지 않는다 (API_DOCS=on으로 켤 수 있다)
  if (!production || process.env.API_DOCS === 'on') {
    SwaggerModule.setup('docs', app, buildOpenApi(app), { jsonDocumentUrl: 'openapi.json' });
  }
  const beta = betaConfig();
  if (beta.enabled && beta.inviteCodes.size === 0) {
    new Logger('Beta').warn('BETA_MODE=true인데 BETA_INVITE_CODES가 비어 있어 아무도 가입할 수 없습니다');
  }
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
