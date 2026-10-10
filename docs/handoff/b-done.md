# B 도메인 완료 (영훈)

브랜치: `feat/b-domain` · 결정 사항: [docs/decisions.md](../decisions.md)의 "B — 영훈 담당" 절

## 상태 요약
- 계약의 B 담당 엔드포인트 전부와 AI 요약 워커를 구현했다.
- **A의 1단계(foundation)가 origin에 올라오지 않은 상태에서 작성했다.** 그래서 아래 "연결 시 할 일"은 아직 하지 않았다. 코드는 계약 ERD로 만든 임시 Prisma 스키마 + 인증 스텁 환경에서 타입 검사·테스트를 통과했다.

## 연결 시 할 일 (A foundation이 들어온 뒤)
1. import 경로 맞추기. B 코드는 다음 경로를 가정한다.
   - `apps/api/src/common/prisma/prisma.service` 의 `PrismaService` (전역 모듈로 제공된다고 가정)
   - `apps/api/src/common/auth` 의 `JwtAuthGuard`, `RolesGuard`, `Roles(...roles)`, `CurrentUser()`
   - `CurrentUser()`가 `{ id: string, roles: Role[] }`를 돌려준다고 가정 (`id` 대신 `sub`면 맞춰야 함)
   - ESM(nodenext)이면 상대 import에 `.js`를 붙여야 한다
2. AppModule에 `ScriptsModule`, `AccessModule`, `NegotiationsModule`, `DealsModule`, `LedgerModule` 등록 (빈 껍데기와 교체)
3. `apps/api` 의존성 추가: `bullmq@^6`, `ioredis@^6`, `class-validator`, `class-transformer`, `@nestjs/swagger` (없다면)
4. 전역 `ValidationPipe({ whitelist: true, transform: true })` 필요 (DTO가 class-validator 기반)
5. 환경변수: API `REDIS_URL`, 워커 `DATABASE_URL`, `REDIS_URL`, 선택 `ANTHROPIC_API_KEY`, `AI_SUMMARIZER=mock|claude`
6. docker compose에 worker 서비스 추가: `apps/worker`에서 `pnpm dev`(tsx watch) 또는 `pnpm build && pnpm start`

## 웹(A)이 알아야 할 응답 형태
- `GET /scripts` → `{ items: ScriptSummary[], nextCursor: string | null }` (쿼리: `genre`, `q`, `mine=true`, `cursor`, `take≤50`). 비로그인 가능
- `GET /scripts/:id` → ScriptDetail. 권한이 없으면 `fullText: null`. `viewer: { isAuthor, accessRequestStatus, canReadFullText }`
- `aiSummary`: `{ summary, tags[], contentRating: 'ALL'|'12'|'15'|'19', model, generatedAt } | null` — 공개 직후 몇 초간 null
- `POST /scripts/:id/publish` 본문 `{ rightsDeclared?: true }` (이미 진술했으면 생략 가능)
- `GET /access-requests?as=writer|producer&status=` → 작가 대시보드는 `as=writer`
- `POST /scripts/:id/negotiations` → 열람 승인 후에만, 이미 있으면 기존 협상 반환
- `GET /negotiations/:id` → 협상 + `offers[]`(오래된 순, 제안 이력 타임라인) + `latestOffer` + `dealId`
- `GET /negotiations/:id/messages?after=<id>` → 오래된 순, 최대 100개 (3초 폴링에 그대로 사용)
- `POST /negotiations/:id/offers` → 상대 제안 위에 내면 상대 것은 `COUNTERED`, 내 것 위에 내면 `WITHDRAWN`
- `POST /offers/:id/accept` → `{ offer, dealId }` (수락 = 매칭, Deal + License 생성)
- `GET /deals/:id/ledger` → `{ dealId, entries[], totals: { REVENUE, PAYOUT, FEE, ADJUSTMENT, balance } }`
- 에러: 400 검증 · 403 역할/권한 · 404 없음 또는 볼 권한 없음 · 409 상태 충돌(이미 처리됨 등)

## 테스트
- 단위: `offer-rules`, `access-rules`, `ledger-rules`, worker `processor`
- DB 통합(`DATABASE_URL` 있을 때): `apps/api/src/modules/deals/test/domain-flow.int-spec.ts` — 전체 흐름, 독점 종료, 철회·거절, 숨김, 동시 수락
- Redis 통합(`REDIS_URL` 있을 때): `scripts/ai-jobs.queue.int-spec.ts`
- `*.int-spec.ts`는 기본 테스트 패턴에 안 잡히므로 테스트 설정의 include에 추가해야 한다. vitest를 쓰면 데코레이터 메타데이터 때문에 `unplugin-swc`가 필요하다.

## 알려진 한계
- Deal을 ACTIVE로 바꾸는 API 없음 (계약에 없음)
- 거절된 열람 요청은 재요청 불가 (409)
- 실제 앱(docker compose) 위에서의 기동·e2e는 foundation이 없어 확인하지 못했다
