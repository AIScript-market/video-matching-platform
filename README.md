# Video Matching Platform

대본 작가와 영상 제작자를 연결하는 플랫폼. 이후 배우·성우의 얼굴과 목소리를 **동의와 라이선스에 근거해 합법적으로** 쓰는 기능과 정산 기능을 단계적으로 추가한다.

## 현재 되는 것

| 흐름 | 내용 |
|---|---|
| 가입·로그인 | 작가 / 제작자 역할 선택 (둘 다 가능). 이메일+비밀번호(argon2id), JWT를 httpOnly 쿠키로 |
| 대본 | 작가가 작성·수정하고, 권리 보유를 진술한 뒤 공개. 공개하면 AI 요약(줄거리·태그·예상 등급)이 자동 생성 |
| 탐색 | 공개 대본 카드 목록, 장르 필터, 검색. 전문은 작가와 열람 승인된 제작자만 |
| 열람 요청 | 제작자가 NDA에 동의하고 요청 → 작가가 대시보드에서 승인·거절 |
| 협상 | 채팅(3초 폴링), 조건 제안(분배 합 100, 선급금, 기간, 독점), 역제안·수락·거절·철회, 제안 이력 |
| 매칭 | 제안 수락 시 딜과 라이선스(초안) 생성. 독점이면 같은 대본의 다른 협상 종료 |
| 장부 | 관리자가 딜별 수익·지급·수수료·조정 기록, 참여자는 조회 |
| 관리자 | 사용자 목록, 대본 숨김·해제, 장부 기록 |

## 실행

준비물: [Docker Desktop](https://www.docker.com/products/docker-desktop/)만 있으면 된다.

```bash
docker compose -f ops/compose.yaml up --build
```

(로컬에 pnpm이 있으면 `pnpm stack`도 같다.) 처음에는 설치 때문에 1~2분 걸린다. 마이그레이션과 시드가 자동으로 적용된다.

| 주소 | 내용 |
|---|---|
| http://localhost:3000 | 웹 |
| http://localhost:4000/docs | API 문서 (Swagger) |
| http://localhost:4000/openapi.json | OpenAPI |
| `localhost:5432` | PostgreSQL (`vmp` / `vmp_local_only`) |

시드 계정 (비밀번호 `password1234`):

| 이메일 | 역할 |
|---|---|
| writer1@example.com | 작가 (공개 대본 2편) |
| writer2@example.com | 작가 + 제작자 (공개 대본 1편) |
| producer1@example.com, producer2@example.com | 제작자 |
| admin@example.com | 관리자 |

AI 요약은 `.env`에 `ANTHROPIC_API_KEY`가 있으면 Claude로, 없으면 mock 요약기로 만든다 (`cp .env.example .env`).

## 구조

```
apps/
  api/      NestJS + Prisma (PostgreSQL)
    src/core/auth           JWT 가드, 역할 가드, @CurrentUser()
    src/modules/identity    가입·로그인·내 정보
    src/modules/backoffice  관리자 API (/admin/*)
    src/modules/{scripts,access,negotiations,deals,ledger}  도메인 API
    prisma/                 스키마, 마이그레이션, 시드
  worker/   BullMQ "ai-jobs" 큐의 script.summarize 처리 (AI 요약)
  studio/   Next.js 웹 (App Router)
ops/        개발용 Dockerfile, compose 파일
docs/       설계, 결정 기록, 인계 문서
```

`apps/web`, 루트 `docker-compose.yml`은 초기 MVP 뼈대로 지금은 쓰지 않는다 (파트너 작업과 이름이 겹치지 않게 새 작업은 다른 디렉터리에 두었다. [docs/decisions.md](docs/decisions.md) 참고).

## 자주 쓰는 명령

```bash
docker compose -f ops/compose.yaml logs -f api worker studio   # 로그
docker compose -f ops/compose.yaml down                        # 종료 (데이터 유지)
docker compose -f ops/compose.yaml down -v                     # 종료 + DB 초기화
```

컨테이너 안에서 명령 실행 (`docker compose -f ops/compose.yaml exec api ...`):

```bash
pnpm --filter api db:migrate --name b_add_something   # 스키마 변경 → 마이그레이션 생성 (A는 a_, B는 b_ 접두어)
pnpm --filter api db:seed                             # 시드 다시 넣기 (멱등)
pnpm --filter api openapi                             # openapi.json 다시 생성
pnpm --filter studio api:types                        # 웹의 API 타입 다시 생성
pnpm lint && pnpm typecheck && pnpm test              # CI와 같은 검사
```

e2e (스택이 떠 있는 상태에서):

```bash
docker run --rm --network vmp_default -e E2E_BASE_URL=http://studio:3000 -v "$PWD":/app -v vmp_node_modules:/app/node_modules -v vmp_studio_node_modules:/app/apps/studio/node_modules -w /app/apps/studio mcr.microsoft.com/playwright:v1.64.0-noble ./node_modules/.bin/playwright test
```

## PR과 자동 머지

`main`에는 직접 push할 수 없다. 기능 브랜치에서 PR을 올리면:

1. CI가 마이그레이션 적용, 스키마·마이그레이션 일치 확인, lint, 타입 검사, 테스트, 빌드를 실행한다.
2. CI를 통과하면 **자동으로 squash merge** 된다. 머지된 브랜치는 15분 안에 자동으로 삭제된다.
3. 단, `apps/api/prisma/`나 `.github/`을 바꾼 PR은 상대방이 Approve해야 머지된다 ([`.github/CODEOWNERS`](.github/CODEOWNERS)).

아직 작업 중인 PR은 **Draft**로 올린다.

## 협업 규칙

1. 기능 브랜치는 짧게(1~3일) 유지한다.
2. 이미 머지된 DB 마이그레이션 파일은 수정하지 않는다. 고칠 게 있으면 새 마이그레이션을 만든다.
3. 비밀 키는 커밋하지 않는다. `.env.example`만 커밋한다.
4. 개발 환경에 실제 배우의 얼굴·목소리 데이터를 넣지 않는다.

전체 설계와 로드맵: [docs/architecture.md](docs/architecture.md)
