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
- 로그인·가입 1분 10회, 서명·열람 요청 1분 20회, 메시지 1분 60회로 IP마다 제한한다 (`apps/api/src/core/rate-limit.ts`).
- 운영에서는 API 문서(/docs)를 닫아 둔다. 필요하면 `API_DOCS=on`.
- 흥행 판단 모델 서비스(`services/ml`)는 베타에서 띄우지 않는다 (`BETA_MODE=true`면 관련 API와 화면이 꺼진다).
- 비밀번호 재설정 메일은 아직 없다. 베타 동안은 문의를 받아 본인 확인 뒤 `apps/api/dist/cli/reset-password.js`(USER_EMAIL, NEW_PASSWORD)로 임시 비밀번호를 정해 준다. 메일 발송 서비스를 정하면 붙인다.
