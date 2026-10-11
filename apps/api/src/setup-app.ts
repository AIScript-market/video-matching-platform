import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

/** main.ts, e2e 테스트, OpenAPI 생성 스크립트가 같은 설정을 쓰도록 한곳에 모은다 */
export function setupApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Video Matching Platform API')
    .setDescription('대본 작가와 영상 제작자를 연결하는 플랫폼 API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('vmp_token')
    .build();
  return SwaggerModule.createDocument(app, config);
}
