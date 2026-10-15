# 운영 이미지 (베타). api·worker·studio를 한 번에 빌드하고, 컨테이너마다 다른 명령으로 띄운다 (ops/prod/compose.yaml).
# 빌드: docker compose -f ops/prod/compose.yaml build
FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/studio/package.json apps/studio/
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY apps/studio apps/studio
# 개발용 계정 전환 화면은 운영 빌드에 넣지 않는다
ENV NEXT_PUBLIC_DEV_ACCOUNTS=false
RUN pnpm --filter api build && pnpm --filter worker build && pnpm --filter studio build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
