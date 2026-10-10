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
