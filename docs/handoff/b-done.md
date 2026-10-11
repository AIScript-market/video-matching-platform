# B 도메인 완료 (영훈)

브랜치: `feat/b-domain` · 결정 사항: [docs/decisions.md](../decisions.md)의 "B — 영훈 담당" 절

## 상태 요약
- 계약의 B 담당 엔드포인트 전부와 AI 요약 워커를 구현했다.
- 파트너의 1단계가 올라오지 않아 **A 파트까지 `feat/b-fullstack` 브랜치에서 직접 구현해 연결했다.** 경로는 파트너 작업과 겹치지 않게 했다 ([decisions.md](../decisions.md)의 "A 파트도 영훈이 구현" 표).
- docker compose로 전체 스택을 띄워 Playwright e2e(가입 → 공개 → AI 요약 → 열람 승인 → 채팅 → 역제안·수락 → 딜)까지 통과했다.

## 파트너가 자기 A 작업을 올릴 때
- 같은 기능이 두 벌 생긴다 (예: `modules/auth`와 `modules/identity`가 둘 다 `/auth/*`를 등록). 어느 쪽을 남길지 정하고 AppModule에서 하나만 등록해야 라우트 충돌이 없다.
- B 모듈은 `src/core/auth`의 `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`와 `src/prisma/prisma.service`를 쓴다. 파트너의 `common`으로 바꾸려면 import 경로만 바꾸면 된다 (`CurrentUser()`가 `{ id, roles }`를 주면 됨).
- 스키마는 계약 ERD 그대로이고 마이그레이션은 `b_contract_schema` 하나다.

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
- API e2e: `apps/api/test/app.e2e-spec.ts` (실제 인증 포함)
- 웹 e2e: `apps/studio/e2e/matching-flow.spec.ts` (Playwright, 실행법은 README)
- `apps/api/vitest.config.ts`가 `*.int-spec.ts`, `test/*.e2e-spec.ts`를 포함하고, 데코레이터 메타데이터를 위해 `unplugin-swc`를 쓴다.

## 알려진 한계
- Deal을 ACTIVE로 바꾸는 API 없음 (계약에 없음)
- 거절된 열람 요청은 재요청 불가 (409)
- 장부는 관리자 수동 기록만 (계약대로). 실제 결제·지급 연동 없음
