# 결정 기록

작업 중 애매했던 부분과 그때 내린 결정. 나중에 바꿔도 되는 것들이다.

## B — 영훈 담당 (scripts, access, negotiations, deals, ledger, worker)

### 범위
- 요청 문구는 "작가 쪽 흐름"이지만, 계약의 폴더 소유권상 scripts·access·negotiations·deals·ledger·worker 전부가 B 담당이고 A의 3단계 통합 시나리오(공개 → AI 요약 → 열람 → 채팅 → 제안 → 딜)가 이 API 전부를 필요로 하므로 계약 API 전체를 구현한다.

### 제안(Offer)
- 협상 하나에 PROPOSED 제안은 항상 최대 1개. 새 제안을 내면 기존 PROPOSED 제안은
  - 상대방이 낸 것이면 `COUNTERED`(역제안 처리),
  - 내가 낸 것이면 `WITHDRAWN`(새 제안으로 대체)으로 바꾼다.
- 수락·거절은 제안자가 아닌 참여자만, 철회는 제안자만 가능. 모두 PROPOSED 상태에서만.
- 비율은 0~100 정수, 합 100. 선급금은 0 이상 정수(원), 상한 20억. 기간은 1~120개월.

### 열람 권한
- 전문(fullText)은 계약대로 작가 본인과 열람 승인(APPROVED)된 제작자만. 관리자도 전문은 볼 수 없다(숨김 판단은 공개 정보로).
- 대본이 숨김(HIDDEN)이 되면 승인된 제작자도 전문을 볼 수 없다.

### 대본 (scripts)
- `GET /scripts`는 `{ items, nextCursor }` 형태의 커서 페이지네이션 (기본 20, 최대 50). 필터: `genre`, `q`(제목·로그라인), `mine=true`(내 대본 전체, 로그인 필요).
- `GET /scripts`, `GET /scripts/:id`는 비로그인도 접근 가능 (OptionalJwtAuthGuard). 로그인하면 응답의 `viewer`에 작가 여부·열람 요청 상태가 채워진다.
- 비공개(DRAFT·HIDDEN) 대본은 작가 본인과 관리자 외에는 404.
- 제작자가 전문을 받아갈 때마다 `ScriptAccessLog`를 남긴다 (작가 본인 조회는 기록하지 않음).
- `POST /scripts`는 WRITER 역할 필요. 수정·공개는 역할이 아니라 작가 본인인지로 판단.
- 공개는 `rightsDeclared=true`가 이미 저장되어 있거나 요청 본문에 `{rightsDeclared:true}`를 함께 보내면 된다. 이미 공개된 대본에 다시 호출하면 그대로 반환(멱등).
- 관리자가 숨긴(HIDDEN) 대본은 작가가 다시 공개할 수 없다(403). 수정은 가능.
- 공개 중인 대본의 권리 보유 진술은 철회할 수 없다(400).
- AI 요약 작업은 공개 시, 그리고 공개 상태에서 본문(fullText)이 바뀔 때 등록한다. Redis 장애로 등록이 실패해도 요청은 성공시키고 로그만 남긴다(3초 시간 제한). `AI_JOBS_DISABLED=true`면 등록하지 않는다(테스트용).

### 열람 요청 (access)
- PRODUCER 역할만 요청 가능, 자기 대본에는 불가.
- 같은 대본에 대한 재요청은 상태와 무관하게 409 (거절 후 재요청 불가). 필요하면 나중에 REJECTED → PENDING 재요청을 허용한다.
- `GET /access-requests?as=writer|producer&status=`: 생략하면 내 대본에 들어온 것과 내가 보낸 것을 모두 반환.

### 협상 (negotiations)
- 협상 시작은 열람 승인(APPROVED)을 받은 제작자만. 같은 대본·제작자 협상이 있으면 기존 것을 반환(멱등, 201).
- 메시지: `after` 없으면 최근 100개, 있으면 그 이후 최대 100개. 항상 오래된 순. 종료(CLOSED)된 협상에는 보낼 수 없고, 합의(AGREED) 후에는 계속 대화 가능.
- 협상 상세·메시지는 참여자와 관리자만, 그 외에는 404.

### 수락 = 매칭
- 수락하면 한 트랜잭션에서 Offer ACCEPTED, Negotiation AGREED, Deal(PENDING_CONTRACT), License(DRAFT, licensee=제작자, scope=조건 요약 문장) 생성.
- 독점(exclusive) 조건이 수락되면 같은 대본의 다른 OPEN 협상은 CLOSED, 그 협상의 PROPOSED 제안은 REJECTED.
- Deal을 ACTIVE로 바꾸는 API는 계약에 없어서 만들지 않았다 (계약서 서명 기능이 생기면 추가).
- `Deal.acceptedOfferId`는 계약에 관계(relation) 표기가 없어 id 값으로만 다루고, 응답에서는 별도 조회로 `acceptedOffer`를 채운다.

### 장부 (ledger)
- REVENUE·PAYOUT·FEE는 양수, ADJUSTMENT는 0이 아닌 정수(음수 가능). 상한 ±20억.
- 응답 `totals.balance = REVENUE - PAYOUT - FEE + ADJUSTMENT` (아직 지급되지 않은 금액의 근사치).
- 조회는 딜 참여자와 관리자, 기록은 관리자만.

### AI 요약 워커 (apps/worker)
- 워커는 API의 Prisma 클라이언트를 공유하지 않고 `pg`로 `"Script"` 테이블을 직접 읽고 쓴다. 계약상 @@map을 쓰지 않으므로 테이블·컬럼명이 모델·필드명과 같다는 점에 기대는 것이다.
- `aiSummary` JSON 형태: `{ summary, tags[], contentRating: 'ALL'|'12'|'15'|'19', model, generatedAt }`.
- `ANTHROPIC_API_KEY`가 있으면 Claude(`claude-opus-5-5`, 구조화 JSON 출력, 거절 시 서버측 대체 모델)로, 없으면 결정적 mock 요약기로 동작. `AI_SUMMARIZER=mock|claude`로 강제 가능.
- 정책 거절(refusal)은 재시도하지 않고 실패 처리, 그 외 오류는 BullMQ가 3회까지 지수 백오프로 재시도.

### 진행 상황
- A의 foundation이 4시간 동안 origin에 없어서 계약 ERD 기반 임시 환경(작업 폴더 밖 scratchpad)에서 검증했다. 실제 연결은 b-done.md "연결 시 할 일" 참고.
- 파트너 프롬프트와 파일 충돌을 피하려고 내 아침 보고는 `docs/morning-report.md`가 아니라 `docs/morning-report-b.md`에 썼다.

## A 파트도 영훈이 구현 (feat/b-fullstack)

파트너의 1단계가 올라오지 않아 A 파트(기반·인증·관리자·웹)까지 직접 구현하고 실제로 띄워 검증했다.

### 디렉터리 이름 — 파트너 작업과 겹치지 않게
파트너가 나중에 자기 작업을 올려도 같은 경로를 덮어쓰지 않도록 계약상 A 소유 이름은 쓰지 않았다.

| 계약상 A 경로 | 이 브랜치에서 쓴 경로 |
|---|---|
| `apps/web` | `apps/studio` (기존 `apps/web` MVP 뼈대는 그대로 두고 워크스페이스에서만 제외) |
| `apps/api/src/common` | `apps/api/src/core` (auth), 기존 `apps/api/src/prisma` 유지 |
| `modules/{auth,users}` | `modules/identity` |
| `modules/admin` | `modules/backoffice` (경로는 계약대로 `/admin/*`) |
| `docker/`, 루트 `docker-compose.yml` | `ops/dev.Dockerfile`, `ops/compose.yaml` (루트 compose는 손대지 않음) |
| `packages/shared` | 만들지 않음 (웹은 openapi-typescript로 생성한 타입을 직접 씀) |
| 루트 `CLAUDE.md` | 만들지 않음 (파트너가 만들 파일이라 충돌 방지). 내용은 README와 이 문서에 |

공용일 수밖에 없는 파일은 고쳤다: 루트 `package.json`·`pnpm-workspace.yaml`·`pnpm-lock.yaml`, `apps/api/prisma/schema.prisma`·`package.json`·`src/app.module.ts`·`src/main.ts`, `.github/workflows/ci.yml`, `README.md`.

### 결정
- pnpm 12 워크스페이스 (`packageManager: pnpm@12.11.2`, corepack). pnpm 12는 승인 안 된 빌드 스크립트가 있으면 설치를 실패시키므로 `pnpm-workspace.yaml`의 `allowBuilds`에 prisma·@prisma/engines·@swc/core·esbuild를 허용, 텔레메트리(@scarf/scarf)·선택적 네이티브 가속(msgpackr-extract)은 거부.
- 루트 스크립트 이름은 `stack`(`pnpm up`은 pnpm 기본 명령이라 못 씀).
- 스키마: 계약 ERD 그대로. 이전 MVP 초안(User/Script/Proposal)에서 바꾸는 마이그레이션 `b_contract_schema`. 데이터 손실 경고 때문에 `migrate dev`가 비대화형 환경에서 멈춰서 `migrate diff`로 SQL을 만들었다. 기존 개발 DB에 데이터가 있으면 적용이 실패할 수 있다 → `down -v`로 초기화.
- 인증: argon2id(`@node-rs/argon2`, 네이티브 빌드 스크립트 불필요), JWT 7일. 토큰은 응답 본문과 httpOnly 쿠키(`vmp_token`, SameSite=Lax) 둘 다로 주고, 가드는 Bearer 헤더와 쿠키를 모두 받는다. 매 요청마다 사용자를 DB에서 다시 읽어 역할 변경이 바로 반영된다.
- 가입으로는 ADMIN 역할을 얻을 수 없다(시드 관리자만). 없는 이메일 로그인도 같은 비용의 해시 검증을 해서 응답 시간으로 가입 여부를 알 수 없게 했다.
- 계약 외 추가 API: `POST /auth/logout`(쿠키 삭제), `GET /admin/scripts`(숨김 포함 목록), `PATCH /admin/scripts/:id/hide`에 `{hidden:false}`로 숨김 해제.
- 웹은 `/api/*`를 Next.js rewrite로 API에 넘긴다. 같은 출처라 httpOnly 쿠키를 CORS 없이 쓸 수 있다.
- 실제 API가 있으므로 MSW 목은 만들지 않았다.
- Next.js의 Cache Components는 켜지 않았다. 화면은 대부분 클라이언트 컴포넌트에서 데이터를 불러온다.
- 분배 비율은 슬라이더와 숫자 입력을 함께 둔다(정밀 입력, 테스트 안정성).
- OpenAPI 생성은 데코레이터 메타데이터가 필요해서 tsx가 아니라 tsc로 컴파일해 실행한다 (`pnpm --filter api openapi`).
- 시드 대본 id는 `seed_script_*`로 고정해서 시드를 여러 번 돌려도 중복되지 않게 했다.
- Playwright는 Pixel 7(모바일 폭) 한 프로젝트로 돌린다. 컨테이너에서 `http://studio:3000`으로 접속하므로 `allowedDevOrigins: ['studio']`가 필요하다.

## 역할 구조: 일반 계정 + 관리자 승인

- 가입하면 역할이 없는 **일반 계정**(`roles = []`)이 된다. 별도 USER 역할 값을 만들지 않고 빈 배열을 일반으로 본다 (계약의 Role 열거형을 그대로 유지).
- 대본 제공자(WRITER)·영상 제작자(PRODUCER)는 `RoleRequest`로 신청하고 관리자가 승인하면 `User.roles`에 추가된다. ADMIN은 신청 대상이 아니다.
- 가입 API의 `roles`를 `requestedRoles`(선택)로 바꿨다. 넣은 권한은 가입과 함께 신청(PENDING)된다. **계약의 `POST /auth/signup` 요청 형태가 바뀐 것**이므로 파트너와 맞춰야 한다.
- 같은 권한에 대기 중인 신청이 있으면 409, 이미 가진 권한이면 400. 거절된 뒤에는 다시 신청할 수 있다.
- 승인은 신청 상태 변경과 역할 추가를 한 트랜잭션으로 처리한다. 인증 가드가 매 요청마다 사용자를 다시 읽으므로 승인 즉시 반영된다 (다시 로그인할 필요 없음).
- 새 API: `POST /role-requests`, `GET /role-requests/mine`, `GET /admin/role-requests?status=`, `POST /admin/role-requests/:id/approve`, `/reject`.
- 사용자용은 `modules/membership`(파트너의 `users`와 겹치지 않는 이름), 관리자용은 `modules/backoffice`에 두었다. `User` 모델에 RoleRequest 관계 필드 2개를 추가했다 (계약상 A 모델 수정).
- 마이그레이션 `b_role_request`.
- 화면에서 역할 이름은 "대본 제공자", "영상 제작자", "관리자", 역할이 없으면 "일반"으로 표시한다.
- 시드 계정은 역할마다 아이디와 비밀번호를 다르게 했다 (`@vmp.dev`). 이전 `@example.com` 시드 계정은 없어졌으므로 기존 개발 DB는 `down -v`로 초기화하는 것이 깔끔하다.

## 대본 업로드, 검토 후 메시지, 관리자 로그

- 업로드: `.txt` `.md` `.fountain` `.docx` `.pdf`, 최대 5MB. 원본 파일은 저장하지 않고 추출한 본문만 `Script.fullText`에 넣는다(저장소 운영 부담·개인정보 최소화). 업로드 사실은 `ScriptUpload`에 남긴다 (파일명, 형식, 크기, 글자 수).
- 텍스트 파일은 UTF-8을 먼저 시도하고 실패하면 EUC-KR로 읽는다. 한글 `.hwp`는 지원하지 않는다 (`.docx`/`.pdf`로 저장해 올리도록 안내). 스캔 이미지 PDF(글자 없는 PDF)는 거부한다.
- 파일로 만든 초안은 제목=파일 이름, 장르="미정", 로그라인·시놉시스는 빈 값. 그래서 **공개할 때 로그라인·시놉시스·장르·전문이 채워져 있는지 검사**를 추가했다.
- 제작자 메시지(`POST /scripts/:id/contact`)는 "검토 후"를 열람 승인 + 실제로 전문을 연 기록(ScriptAccessLog)으로 판단한다. 메시지는 별도 테이블이 아니라 그 대본·제작자의 협상 대화(Message)에 이어서 남긴다. 협상이 없으면 만든다.
- 전문 열람 기록은 같은 사람이 같은 대본을 10분 안에 다시 연 경우 한 번으로 본다 (상세 화면이 AI 요약을 기다리며 3초마다 다시 불러와서 기록이 부풀던 문제).
- 관리자 활동 로그: `GET /admin/logs/messages`, `/views`, `/uploads` (검색 q, 커서 페이지). 메시지 로그는 받는 사람(협상의 다른 참여자)도 함께 보여준다. 제작자 메시지 패널에 "관리자가 기록을 볼 수 있다"고 안내한다.
