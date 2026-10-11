# 개발용 Node 이미지. 소스는 ops/compose.yaml에서 볼륨으로 마운트한다.
FROM node:24-bookworm-slim

# openssl: Prisma 마이그레이션 엔진 / procps(ps): nest --watch 재시작 시 이전 프로세스 종료
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl procps \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_store_dir=/pnpm-store
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

WORKDIR /app
