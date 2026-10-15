# Video Matching Platform

대본 작가와 영상 제작자를 연결하는 플랫폼. 이후 배우·성우의 얼굴과 목소리를 **동의와 라이선스에 근거해 합법적으로** 쓰는 기능과 정산 기능을 단계적으로 추가한다.

## 현재 되는 것

| 흐름 | 내용 |
|---|---|
| 계정 | **일반 계정**과 **관리자 계정** 두 가지. 가입하면 일반 계정 + 10코인. 이메일+비밀번호(argon2id), JWT를 httpOnly 쿠키로 |
| 프로필 | 이름·소개·이메일. 대본 제공·영상 제작을 하려면 **소개를 쓰고 프로필과 이메일을 공개**해야 함. 공개 프로필 페이지(`/users/:id`) |
| 코인 | 메시지 1코인, 미리보기 열람 3코인(대본당 한 번), 대본 파일 업로드 5코인. 패키지 구매(지금은 테스트 결제로 바로 충전), 사용·충전 내역 |
| 탈퇴·정지 | 탈퇴하면 공개 대본을 내리고 진행 중인 협상을 종료, 같은 이메일로 다시 가입 가능. 관리자가 정지한 계정은 로그인 불가, 대본이 공개 목록에서 빠지고, 같은 이메일로 재가입 불가 |
| 대본 | 작가가 직접 작성하거나 파일(.txt .md .fountain .docx .pdf, 5MB)을 올려 초안을 만들고, 권리 보유를 진술한 뒤 공개. 공개하면 AI 요약(줄거리·태그·예상 등급)이 자동 생성 |
| AI 요약 | 대본 내용(제목·로그라인·시놉시스·장르·전문)이 바뀔 때마다 자동으로 다시 생성(초안 포함). 작성자는 "AI 요약 새로고침"으로 직접 다시 만들 수 있고, "대본 마지막 수정"·"요약 생성" 시각을 함께 표시 |
| 미리보기 대본 | 전문과 별도로 일부분만 작성하거나 파일로 올림. 다른 사용자는 **코인으로 열람권을 사야** 볼 수 있음 |
| 검토 후 메시지 | 전문을 열람한 제작자가 대본 상세에서 작가에게 바로 메시지. 대화는 협상방으로 이어지고 작가 대시보드에 "받은 메시지"로 표시 |
| 탐색 | 공개 대본 카드 목록, 장르 필터, 검색. 전문은 작가와 열람 승인된 제작자만 |
| 열람 요청 | 제작자가 NDA에 동의하고 요청 → 작가가 대시보드에서 승인·거절 |
| 협상 | 채팅(3초 폴링), 조건 제안(분배 합 100, 선급금, 기간, 독점), 역제안·수락·거절·철회, 제안 이력 |
| 매칭 | 제안 수락 시 딜과 라이선스(초안) 생성. 독점이면 같은 대본의 다른 협상 종료 |
| 장부 | 관리자가 딜별 수익·지급·수수료·조정 기록, 참여자는 조회 |
| 관리자 | 일반 계정 정지·해제, 코인 지급, 사용자 목록·검색, 대본 숨김·해제, 장부 기록, **활동 로그**(메시지·전문 열람·업로드·코인, `/admin/logs`) |
| 출연자 | 일반 계정이 출연자(배우·일반인)로 등록: 본인인증, 얼굴 스캔 업로드(파일별 암호화), 실시간 셀카 대조, 민감정보 동의. 미성년자는 보호자 동의와 관리자 확인. 철회하면 7일 숙려 후(진행 중 계약은 제작 기한 후) 원본 삭제 |
| 캐스팅 | 딜의 작가·제작자가 작품과 배역을 만들고, 공개 오디션 지원이나 직접 제안으로 출연료(고정·회당·수익 배분·혼합)를 협상해 출연 계약. 미성년자 계약은 보호자 승인. 작품은 계약 범위(장면 유형)·출연분 확인·AI 표시를 통과해야 공개. 기준: [docs/policies/likeness-policy.md](docs/policies/likeness-policy.md) |
| 흥행 판단 | LLM이 아닌 **자체 통계 모델**: 대본을 장면 벡터로 바꾸고, 작품 성과(채널 크기 보정한 조회수·좋아요·긍정 댓글)와 연결해 "상위 20% 성과일 확률"을 학습(`services/ml`, Python). 데이터가 쌓이기 전에는 비슷한 작품을 보여 줌. 영상 제작자에게 대본별 판단과 추천(`/recommendations`), 작가 본인에게는 비공개. 대본별 학습 동의, 작품 성과 기록, 관리자 학습 화면(`/admin/ml`). [docs/hit-model.md](docs/hit-model.md), 가능성 검증 계획 [docs/feasibility-study.md](docs/feasibility-study.md) |

### 계정별로 할 수 있는 것

| 계정 | 할 수 있는 것 |
|---|---|
| 일반 (프로필 비공개) | 공개 대본 탐색, 공개 정보·AI 요약 보기, 프로필 편집, 코인 구매, 탈퇴 |
| 일반 (소개 작성 + 프로필·이메일 공개) | 위 + **대본 제공**(작성·업로드·공개, 열람 요청 승인, 제안 응답)과 **영상 제작**(열람 요청, 미리보기 열람, 검토 메시지, 협상·제안). 한 계정이 둘 다 할 수 있다 |
| 관리자 | 계정 정지·해제, 코인 지급·회수, 활동 로그, 대본 숨김, 장부 기록 (창작 활동은 하지 않음) |

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

흥행 판단 모델(`ml` 서비스)도 함께 뜬다. 화면 흐름을 보려면 합성 데모 데이터를 넣는다: `docker compose -f ops/compose.yaml exec api pnpm --filter api db:seed:ml-demo` ([docs/hit-model.md](docs/hit-model.md#실행))

시드 계정:

| 계정 | 아이디 | 비밀번호 | 비고 |
|---|---|---|---|
| 관리자 | `admin@vmp.dev` | `admin1234!` | |
| 일반 (공개) | `writer1@vmp.dev`, `writer2@vmp.dev` | `writer1234!` | 공개 대본 2편 / 1편, 100코인 |
| 일반 (공개) | `producer1@vmp.dev`, `producer2@vmp.dev` | `producer1234!` | 100코인 |
| 일반 (비공개) | `member1@vmp.dev` | `member1234!` | 프로필 공개 전이라 창작 활동 불가, 10코인 |
| 정지된 계정 | `suspended1@vmp.dev` | `member1234!` | 로그인·같은 이메일 재가입 불가 |
| 출연자 | `talent1@vmp.dev`(배우), `talent2@vmp.dev`(일반인) | `talent1234!` | 등록 완료. 한별은 "마지막 열차" 정수 역으로 계약, 1화 확인 대기 |
| 출연자 (아역) | `kid1@vmp.dev` | `talent1234!` | 14세. 수아 역 제안이 보호자 승인 대기 |
| 보호자 | `guardian1@vmp.dev` | `guardian1234!` | 아역 서아의 법정대리인 |

"마지막 열차"(writer1)에는 미리보기 대본이 있어서 다른 계정으로 3코인 열람권 구매를 시험할 수 있다.

**계정별 접속 주소 (개발용)**: http://localhost:3000/dev/accounts 에 계정마다 전용 주소가 있다 (`admin.localhost:3000`, `writer1.localhost:3000`, `producer1.localhost:3000`, `member1.localhost:3000`, `suspended1.localhost:3000` …). 로그인 쿠키는 호스트 이름별로 나뉘므로, 주소가 다르면 한 브라우저의 여러 탭에서 서로 다른 계정을 동시에 쓸 수 있다. "바로 로그인"은 `<계정>.localhost:3000/dev/login?as=<계정>`으로 시드 계정에 자동 로그인한다. `NEXT_PUBLIC_DEV_ACCOUNTS=true`일 때만 나타난다 (ops/compose.yaml에서만 켬). `*.localhost`는 Chrome·Edge·Firefox에서 바로 열린다.

AI 요약은 `.env`에 `ANTHROPIC_API_KEY`가 있으면 Claude로, 없으면 mock 요약기로 만든다 (`cp .env.example .env`).

## 구조

```
apps/
  api/      NestJS + Prisma (PostgreSQL)
    src/core/auth           JWT 가드(정지 계정 차단), 관리자 가드, CreatorGuard(프로필·이메일 공개 확인), @CurrentUser()
    src/modules/identity    가입·로그인·내 정보
    src/modules/profiles    공개 프로필, 프로필 편집, 탈퇴
    src/modules/wallet      코인 (가격표, 구매, 차감, 내역)
    src/modules/backoffice  관리자 API (/admin/*: 계정 정지, 코인 지급, 활동 로그)
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
