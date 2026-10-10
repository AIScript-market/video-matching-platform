# 개발용 이미지: 소스 코드는 docker-compose에서 볼륨으로 마운트한다.
FROM node:24-bookworm-slim

# openssl: Prisma 마이그레이션 엔진이 사용
# procps(ps): nest --watch가 재시작할 때 이전 서버 프로세스를 찾아 종료하는 데 필요
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
