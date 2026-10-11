import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { buildOpenApi, setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  // 웹(apps/studio)은 Next.js rewrite로 같은 출처에서 부르므로 CORS는 직접 호출용
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  SwaggerModule.setup('docs', app, buildOpenApi(app), { jsonDocumentUrl: 'openapi.json' });
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
