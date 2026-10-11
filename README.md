# Video Matching Platform

대본 작가와 영상 제작자를 연결하는 플랫폼. 이후 배우·성우의 얼굴과 목소리를 **동의와 라이선스에 근거해 합법적으로** 쓰는 기능과 정산 기능을 단계적으로 추가한다.

## 현재 되는 것

| 흐름 | 내용 |
|---|---|
| 가입·로그인 | 가입하면 **일반 계정**. 이메일+비밀번호(argon2id), JWT를 httpOnly 쿠키로 |
| 권한 신청 | 일반 계정이 대본 제공자 / 영상 제작자 권한을 신청(가입 시 함께 신청 가능) → 관리자가 승인하면 역할이 생김 |
| 대본 | 작가가 직접 작성하거나 파일(.txt .md .fountain .docx .pdf, 5MB)을 올려 초안을 만들고, 권리 보유를 진술한 뒤 공개. 공개하면 AI 요약(줄거리·태그·예상 등급)이 자동 생성 |
| 검토 후 메시지 | 전문을 열람한 제작자가 대본 상세에서 작가에게 바로 메시지. 대화는 협상방으로 이어지고 작가 대시보드에 "받은 메시지"로 표시 |
| 탐색 | 공개 대본 카드 목록, 장르 필터, 검색. 전문은 작가와 열람 승인된 제작자만 |
| 열람 요청 | 제작자가 NDA에 동의하고 요청 → 작가가 대시보드에서 승인·거절 |
| 협상 | 채팅(3초 폴링), 조건 제안(분배 합 100, 선급금, 기간, 독점), 역제안·수락·거절·철회, 제안 이력 |
| 매칭 | 제안 수락 시 딜과 라이선스(초안) 생성. 독점이면 같은 대본의 다른 협상 종료 |
| 장부 | 관리자가 딜별 수익·지급·수수료·조정 기록, 참여자는 조회 |
| 관리자 | 권한 신청 승인·거절, 사용자 목록, 대본 숨김·해제, 장부 기록, **활동 로그**(메시지·전문 열람·업로드, `/admin/logs`) |

### 역할별로 할 수 있는 것

| 역할 | 할 수 있는 것 |
|---|---|
| 일반 | 공개 대본 탐색·공개 정보 보기, 권한 신청 |
| 대본 제공자 (WRITER) | 대본 작성·파일 업로드·수정·공개, 열람 요청 승인·거절, 받은 메시지 답장, 협상·제안 응답, 딜 조회 |
| 영상 제작자 (PRODUCER) | NDA 동의 후 전문 열람 요청, 검토 후 작가에게 메시지, 협상·제안, 딜 조회 |
| 관리자 (ADMIN) | 권한 신청 처리, 활동 로그 열람, 사용자 목록, 대본 숨김, 장부 기록 |

한 계정이 대본 제공자와 영상 제작자 권한을 둘 다 가질 수 있다. 관리자 권한은 신청할 수 없다.

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

역할별 임시 계정 (시드):

| 역할 | 아이디 | 비밀번호 | 비고 |
|---|---|---|---|
| 관리자 | `admin@vmp.dev` | `admin1234!` | |
| 대본 제공자 | `writer1@vmp.dev` | `writer1234!` | 공개 대본 2편 |
| 대본 제공자 | `writer2@vmp.dev` | `writer1234!` | 공개 대본 1편 |
| 영상 제작자 | `producer1@vmp.dev` | `producer1234!` | |
| 영상 제작자 | `producer2@vmp.dev` | `producer1234!` | |
| 일반 | `member1@vmp.dev` | `member1234!` | 권한 없음 |
| 일반 (신청 대기) | `applicant1@vmp.dev` | `member1234!` | 대본 제공자 권한 신청 대기 |
| 일반 (신청 대기) | `applicant2@vmp.dev` | `member1234!` | 영상 제작자 권한 신청 대기 |

관리자로 로그인해 `/admin`에서 applicant 계정의 신청을 승인하면, 그 계정으로 다시 들어갔을 때 대본 제공자·제작자 메뉴가 생긴다.

**계정별 접속 주소 (개발용)**: http://localhost:3000/dev/accounts 에 계정마다 전용 주소가 있다 (`admin.localhost:3000`, `writer1.localhost:3000`, `producer1.localhost:3000`, `member1.localhost:3000` …). 로그인 쿠키는 호스트 이름별로 나뉘므로, 주소가 다르면 한 브라우저의 여러 탭에서 서로 다른 계정을 동시에 쓸 수 있다. "바로 로그인"은 `<계정>.localhost:3000/dev/login?as=<계정>`으로 시드 계정에 자동 로그인한다. `NEXT_PUBLIC_DEV_ACCOUNTS=true`일 때만 나타난다 (ops/compose.yaml에서만 켬). `*.localhost`는 Chrome·Edge·Firefox에서 바로 열린다.

AI 요약은 `.env`에 `ANTHROPIC_API_KEY`가 있으면 Claude로, 없으면 mock 요약기로 만든다 (`cp .env.example .env`).

## 구조

```
apps/
  api/      NestJS + Prisma (PostgreSQL)
    src/core/auth           JWT 가드, 역할 가드, @CurrentUser()
    src/modules/identity    가입·로그인·내 정보
    src/modules/membership  권한 신청 (일반 → 대본 제공자 / 영상 제작자)
    src/modules/backoffice  관리자 API (/admin/*, 권한 신청 승인·거절 포함)
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
