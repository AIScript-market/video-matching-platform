# 스키마 변경 제안: 계약·영상 게시·정산 (영훈 님 승인 요청)

> `apps/api/prisma/`는 영훈 님 승인 뒤에만 바꾼다. 승인 전이라 스키마는 건드리지 않고, 바꿀 내용을 여기에 적는다.
> 배경: [사업 모델](business-model.md) "베타에서 만드는 것" 2~4번. 템플릿과 정산 규칙은 이미 코드로 있다:
> `apps/api/src/modules/contracts/contract-templates.ts`, `settlement-rules.ts` (스키마 없이 테스트됨).

## 무엇이 바뀌나

| 새 모델 | 용도 |
|---|---|
| `Contract` | 계약 한 건. 종류(NDA·대본 이용허락·채널 게시), 템플릿 버전, 고정된 본문과 SHA-256, 상태(서명 대기·서명 완료·무효), 딜·열람 요청 연결 |
| `ContractParty` | 당사자와 서명 기록 (역할, 계약서상 이름, 서명 시각, 서명할 때 입력한 이름, IP, 브라우저 정보) |
| `ChannelVideo` | 제작자가 딜에 묶어 제출한 영상, 검수 상태, 게시한 YouTube 영상 번호 |
| `VideoRevenue` | 영상별 월 확정 광고 수익 (관리자 입력) |
| `SettlementPayout` | 작가·제작자에게 지급한 기록 (베타는 플랫폼 밖 이체 후 기록) |

기존 모델은 역관계 필드만 늘어난다 (`User`, `Deal`, `ScriptAccessRequest`). 기존 열은 바꾸지 않는다.
마이그레이션 이름: `b_contracts_channel`.

## 흐름

1. 열람 요청 때 비밀유지 서약서(`NDA`)를 만들고 제작자 서명을 같은 트랜잭션에서 기록한다 (지금의 `ndaAcceptedAt` 체크를 대신하지 않고 보강).
2. 제안 수락 때 딜(`PENDING_CONTRACT`)과 함께 대본 이용허락 계약(`SCRIPT_LICENSE`)을 만든다. 작가·제작자가 모두 서명하면 딜 `ACTIVE`, 라이선스 `ACTIVE`(시작·종료일 설정).
3. 제작자는 첫 영상 제출 전에 채널 게시 계약(`CHANNEL_PUBLISHING`)에 서명한다. 플랫폼 서명은 계약을 만들 때 기록한다.
4. 제작자가 딜에 묶어 영상을 제출 → 관리자 검수(승인·거절) → 관리자가 채널에 올리고 영상 번호 기록.
5. 관리자가 끝난 달의 확정 수익을 영상마다 입력 → 수락된 배분율로 작가·제작자 몫 계산(플랫폼 0) → 지급 기록.

## 스키마 (추가분)

```prisma
enum ContractKind {
  NDA
  SCRIPT_LICENSE
  CHANNEL_PUBLISHING
}

enum ContractStatus {
  AWAITING_SIGNATURES
  SIGNED
  VOID
}

enum ContractPartyRole {
  WRITER
  PRODUCER
  PLATFORM
}

model Contract {
  id              String               @id @default(cuid())
  kind            ContractKind
  templateVersion String
  title           String
  body            String               @db.Text
  bodySha256      String
  status          ContractStatus       @default(AWAITING_SIGNATURES)
  dealId          String?              @unique
  deal            Deal?                @relation(fields: [dealId], references: [id])
  accessRequestId String?              @unique
  accessRequest   ScriptAccessRequest? @relation(fields: [accessRequestId], references: [id])
  createdAt       DateTime             @default(now())
  signedAt        DateTime?
  voidedAt        DateTime?
  voidReason      String?

  parties ContractParty[]

  @@index([kind, status])
}

model ContractParty {
  id         String            @id @default(cuid())
  contractId String
  contract   Contract          @relation(fields: [contractId], references: [id], onDelete: Cascade)
  role       ContractPartyRole
  userId     String?
  user       User?             @relation(fields: [userId], references: [id])
  legalName  String
  signedAt   DateTime?
  signedName String?
  ip         String?
  userAgent  String?

  @@unique([contractId, role])
  @@index([userId])
}

enum ChannelVideoStatus {
  SUBMITTED
  APPROVED
  PUBLISHED
  REJECTED
  REMOVED
}

model ChannelVideo {
  id              String             @id @default(cuid())
  dealId          String
  deal            Deal               @relation(fields: [dealId], references: [id])
  producerId      String
  producer        User               @relation("ChannelVideoProducer", fields: [producerId], references: [id])
  title           String
  description     String?            @db.Text
  sourceUrl       String
  rightsChecklist Json
  status          ChannelVideoStatus @default(SUBMITTED)
  reviewNote      String?
  reviewedById    String?
  reviewedBy      User?              @relation("ChannelVideoReviewer", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  channelName     String?
  youtubeVideoId  String?            @unique
  publishedAt     DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  revenues VideoRevenue[]

  @@index([dealId])
  @@index([status])
}

model VideoRevenue {
  id          String       @id @default(cuid())
  videoId     String
  video       ChannelVideo @relation(fields: [videoId], references: [id])
  month       String
  amountKrw   Int
  memo        String?
  createdById String
  createdBy   User         @relation(fields: [createdById], references: [id])
  createdAt   DateTime     @default(now())

  payouts SettlementPayout[]

  @@unique([videoId, month])
}

model SettlementPayout {
  id          String            @id @default(cuid())
  revenueId   String
  revenue     VideoRevenue      @relation(fields: [revenueId], references: [id])
  role        ContractPartyRole
  recipientId String
  recipient   User              @relation("PayoutRecipient", fields: [recipientId], references: [id])
  amountKrw   Int
  paidAt      DateTime
  memo        String?
  createdById String
  createdBy   User              @relation("PayoutCreator", fields: [createdById], references: [id])

  @@unique([revenueId, role])
}
```

역관계 추가:

```prisma
model User {
  // ...
  contractParties ContractParty[]
  channelVideos   ChannelVideo[]     @relation("ChannelVideoProducer")
  videoReviews    ChannelVideo[]     @relation("ChannelVideoReviewer")
  revenueRecords  VideoRevenue[]
  payoutsReceived SettlementPayout[] @relation("PayoutRecipient")
  payoutsRecorded SettlementPayout[] @relation("PayoutCreator")
}

model ScriptAccessRequest {
  // ...
  ndaContract Contract?
}

model Deal {
  // ...
  contract Contract?
  videos   ChannelVideo[]
}
```

## 확인받고 싶은 것

- 기존 `LedgerEntry`(관리자 수동 장부)는 그대로 두고, 영상 정산은 새 모델로 따로 둔다. 장부와 합칠지.
- 서명 기록에 IP·브라우저 정보를 남기는 것 (개인정보 처리방침에 적는다).
- 운영 배포 때 프록시 뒤에서 실제 IP를 읽도록 `trust proxy` 설정.
