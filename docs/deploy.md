# 베타 배포 절차

> 구성 파일: [`ops/prod/`](../ops/prod). 서버 한 대 + Docker + Caddy(HTTPS 자동). 베타 규모(작가 수십 명, 제작팀 열몇 곳)에 맞춘 구성이다.
> 사람이 정해야 할 것: 서버(호스팅), 도메인, 비밀값, 초대 코드, 계약서의 플랫폼 운영자 이름. 나머지는 아래 명령으로 된다.

## 1. 서버 준비

- 국내 리전 클라우드 VM 한 대: 2 vCPU, 4GB 메모리, 디스크 40GB 이상, Ubuntu 24.04 LTS (예: AWS Lightsail 서울, NCP).
- 방화벽: 22(SSH, 내 IP만), 80, 443만 연다. DB·API 포트는 열지 않는다.
- Docker Engine과 Compose 플러그인 설치 (Docker 공식 문서의 Ubuntu 설치 절차).
- 도메인의 A 레코드를 서버 IP로 맞춘다 (예: `beta.서비스도메인`). Caddy가 이 도메인으로 인증서를 받는다.

## 2. 올리기

```bash
git clone https://github.com/zerohoon123/video-matching-platform.git && cd video-matching-platform
cp ops/prod/production.env.example ops/prod/production.env
# production.env 채우기: SITE_DOMAIN, WEB_ORIGIN, POSTGRES_PASSWORD, JWT_SECRET, BETA_INVITE_CODES, PLATFORM_LEGAL_NAME
docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env up -d --build
```

- 첫 실행 때 api 컨테이너가 마이그레이션을 적용한다. 운영에서는 시드(데모 계정)를 넣지 않는다.
- 확인: `https://도메인`이 열리고 메뉴에 "베타" 표시가 보이면 된다. API 상태는 서버 안에서
  `docker compose -f ops/prod/compose.yaml exec api node -e "fetch('http://localhost:4000/health').then(r=>r.text()).then(console.log)"`.

## 3. 관리자 계정

```bash
docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env run --rm \
  -e ADMIN_EMAIL=운영자이메일 -e ADMIN_NAME=운영자 -e ADMIN_PASSWORD='12자 이상' \
  api node apps/api/dist/cli/create-admin.js
```

## 4. 초대 코드

- `BETA_INVITE_CODES`에 쉼표로 넣는다. 묶음마다 다른 코드(예: `writers-1`, `studios-1`)를 주면 나중에 구분하기 쉽다.
- 바꾼 뒤에는 `docker compose ... up -d` 로 다시 띄운다 (재빌드는 필요 없다).
- 가입 화면은 초대 코드와 만 19세 이상 확인, 약관·개인정보 처리방침 동의를 받는다.

## 4-1. 영상 저장소 (Cloudflare R2)

제작자가 올리는 검수용 영상은 우리 서버를 거치지 않는다. 브라우저가 API에서 받은 서명 주소(1시간)로 R2에 바로 올리고, 관리자도 서명 주소(30분)로 R2에서 바로 받는다.
서버는 주소에 서명하고 크기만 확인하므로 메모리·디스크·회선 부담이 없다. 게시를 기록하거나 거절하면 파일을 바로 지운다.
설정하지 않으면 영상 파일 올리기가 꺼지고 제작자는 링크로만 제출한다.

1. Cloudflare 가입 → R2 → **버킷 만들기**: 이름 `vmp-videos`, 위치는 자동(또는 아시아 태평양).
2. 버킷 → 설정 → **CORS 정책**에 아래를 넣는다 (도메인은 우리 주소로):

   ```json
   [{ "AllowedOrigins": ["https://beta.example.com"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```

3. 버킷 → 설정 → **객체 수명 주기 규칙**: 버킷 전체, 올린 지 **60일** 뒤 삭제. 제출하지 않고 버려진 파일이나 지우기에 실패한 파일을 치운다 (개인정보 처리방침에 적은 기간).
4. R2 → **API 토큰 관리** → 토큰 만들기: 권한 "객체 읽기 및 쓰기", 대상은 `vmp-videos` 버킷만. 나오는 액세스 키 ID와 비밀 액세스 키를 `production.env`에 넣는다 (다시 볼 수 없으니 바로 넣는다).
5. `production.env`의 `VIDEO_STORAGE_*`를 채운다. 엔드포인트는 `https://<계정 ID>.r2.cloudflarestorage.com` (R2 개요 화면에 있다).
6. 확인: 시험 파일을 올리고 받고 지운다.

   ```bash
   docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env run --rm api node apps/api/dist/cli/check-video-storage.js
   ```

   그다음 제작자 계정으로 딜 화면에서 작은 영상을 하나 올려 본다 (브라우저 CORS 확인).

비용: 저장 용량 월 10GB까지 무료, 넘으면 GB당 월 약 0.015달러이고 내려받기(송신)는 무료다. 검수가 끝나면 지우므로 보통 무료 범위 안이다. 한 파일은 2GB까지 받는다.
AWS S3 등 다른 S3 호환 저장소도 같은 변수로 쓸 수 있다 (`VIDEO_STORAGE_REGION`을 그 리전으로).

## 4-2. AI 요약 (Gemini)

제작자가 많은 대본 가운데 볼 만한 것을 빨리 고르도록, 작가가 공개한 **제목·장르·로그라인·시놉시스만** Gemini로 요약해 목록에 보여 준다.
대본 전문과 미리보기는 AI로 보내지 않는다 (워커가 DB에서 읽지도 않는다, `apps/worker/src/db.ts`). 그래서 요약은 시놉시스처럼 누구나 본다.
작가가 홍보하려고 공개한 글이라 따로 동의를 받지 않고, 국외 AI로 보낸다는 점은 개인정보 처리방침·약관·도움말과 대본 작성 화면의 시놉시스 아래에 알린다.

1. [Google AI Studio](https://aistudio.google.com/)에서 API 키를 만든다. 키가 속한 Cloud 프로젝트에 **결제 계정이 연결돼 있어야** 한다.
   결제가 연결된 유료 등급에서만 Google이 보낸 내용을 제품 개선에 쓰지 않는다 ([Gemini API 추가 약관](https://ai.google.dev/gemini-api/terms)). 무료 등급 키는 보낸 소개 글이 학습·사람 검토에 쓰일 수 있으니 쓰지 않는다.
2. `production.env`에 `GEMINI_API_KEY`를 넣는다. 키는 저장소·채팅에 올리지 않는다.
3. 워커를 다시 띄우고 로그에서 `summarizer=gemini-3.8-flash`를 확인한다:

   ```bash
   docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env up -d worker && docker compose -f ops/prod/compose.yaml logs worker | tail -5
   ```

## 5. 백업

- 매일 DB를 덤프한다. 서버 crontab 예 (매일 04:00, 14일 보관):

```bash
0 4 * * * cd /home/ubuntu/video-matching-platform && docker compose -f ops/prod/compose.yaml exec -T db sh -c 'pg_dump -U vmp vmp | gzip > /backups/vmp-$(date +\%F).sql.gz' && find ops/prod/backups -name 'vmp-*.sql.gz' -mtime +14 -delete
```

- 덤프는 `ops/prod/backups/`에 쌓인다(저장소에는 안 들어간다). 주 1회는 서버 밖(내 컴퓨터, 다른 저장소)으로 복사한다.
- 복구: `gunzip -c 파일 | docker compose -f ops/prod/compose.yaml exec -T db psql -U vmp vmp`

## 6. 업데이트

```bash
git pull && docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env up -d --build
```

## 운영하며 지킬 것

- 계약서 서명 기록에 IP가 남는다. Caddy → studio → api 두 단계 프록시라 `TRUST_PROXY=2`로 두었다. 구성을 바꾸면 이 값도 맞춘다.
- 로그인·가입 1분 10회, 서명·열람 요청 1분 20회, 메시지 1분 60회로 IP마다 제한한다 (`apps/api/src/core/rate-limit.ts`). 운영(`NODE_ENV=production`)에서만 기본으로 켜지고, 개발에서는 `RATE_LIMIT=on`일 때만.
- 운영에서는 API 문서(/docs)를 닫아 둔다. 필요하면 `API_DOCS=on`.
- 검수용 영상 파일은 R2에 있고 DB 백업에는 들어가지 않는다. 검수 중인 파일만 있으므로 따로 백업하지 않는다.
- AI 요약 키(`GEMINI_API_KEY`)를 바꾸거나 결제가 끊기면 요약이 실패한다. 워커 로그의 `실패`를 가끔 확인한다.
- 흥행 판단 모델 서비스(`services/ml`)는 베타에서 띄우지 않는다 (`BETA_MODE=true`면 관련 API와 화면이 꺼진다).
- 비밀번호 재설정 메일은 아직 없다. 베타 동안은 문의를 받아 본인 확인 뒤 `apps/api/dist/cli/reset-password.js`(USER_EMAIL, NEW_PASSWORD)로 임시 비밀번호를 정해 준다. 메일 발송 서비스를 정하면 붙인다.
