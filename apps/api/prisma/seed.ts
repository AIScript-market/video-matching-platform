// 개발용 시드. 여러 번 실행해도 같은 결과가 되도록 upsert한다.
// 계정 종류는 일반·관리자 두 가지. 대본 제공·영상 제작은 프로필과 이메일을 공개한 일반 계정이 한다.
//   관리자                admin@vmp.dev       / admin1234!
//   일반 (공개, 대본 제공) writer1@vmp.dev, writer2@vmp.dev     / writer1234!
//   일반 (공개, 영상 제작) producer1@vmp.dev, producer2@vmp.dev / producer1234!
//   일반 (비공개)          member1@vmp.dev     / member1234!
//   정지된 계정            suspended1@vmp.dev  / member1234!  (로그인·같은 이메일 재가입 불가)
//   출연자 (배우·일반인)    talent1@vmp.dev, talent2@vmp.dev / talent1234!
//   출연자 (아역, 14세)     kid1@vmp.dev        / talent1234!
//   보호자 (아역의 대리인)  guardian1@vmp.dev   / guardian1234!
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Role, type UserStatus } from '../src/generated/prisma/client.js';
import { renderScriptLicense, sha256 } from '../src/modules/contracts/contract-templates.js';
import { adultOnFrom, POLICY_VERSION, type ContentTag } from '../src/modules/talent/likeness-policy.js';
import { vaultFromEnv } from '../src/modules/talent/likeness-vault.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type SeedUser = {
  email: string;
  displayName: string;
  roles: Role[];
  password: string;
  bio?: string;
  /** 프로필·이메일 공개 */
  public?: boolean;
  coins: number;
  status?: UserStatus;
  suspendReason?: string;
};

const SEED_USERS: SeedUser[] = [
  { email: 'admin@vmp.dev', displayName: '관리자', roles: ['ADMIN'], password: 'admin1234!', coins: 0 },
  {
    email: 'writer1@vmp.dev', displayName: '김작가', roles: [], password: 'writer1234!', public: true, coins: 100,
    bio: '미스터리·드라마 작가. 단편영화 시나리오 공모전 2회 수상.',
  },
  {
    email: 'writer2@vmp.dev', displayName: '이작가', roles: [], password: 'writer1234!', public: true, coins: 100,
    bio: 'SF와 스릴러를 씁니다. 웹드라마 2편 집필.',
  },
  {
    email: 'producer1@vmp.dev', displayName: '박제작', roles: [], password: 'producer1234!', public: true, coins: 100,
    bio: '독립영화 제작사 PD. 장편 3편 제작.',
  },
  {
    email: 'producer2@vmp.dev', displayName: '최제작', roles: [], password: 'producer1234!', public: true, coins: 100,
    bio: 'OTT 숏폼 드라마 프로듀서.',
  },
  { email: 'member1@vmp.dev', displayName: '정일반', roles: [], password: 'member1234!', coins: 10 },
  {
    email: 'suspended1@vmp.dev', displayName: '강정지', roles: [], password: 'member1234!', coins: 0,
    status: 'SUSPENDED', suspendReason: '타인의 대본을 무단으로 올림',
  },
  { email: 'talent1@vmp.dev', displayName: '최한별', roles: [], password: 'talent1234!', coins: 10 },
  { email: 'talent2@vmp.dev', displayName: '정도윤', roles: [], password: 'talent1234!', coins: 10 },
  { email: 'kid1@vmp.dev', displayName: '윤서아', roles: [], password: 'talent1234!', coins: 10 },
  { email: 'guardian1@vmp.dev', displayName: '윤보호', roles: [], password: 'guardian1234!', coins: 10 },
];

const scripts = [
  {
    id: 'seed_script_last_train',
    trainingConsent: true,
    previewText: 'S#1. 폐역 승강장 (밤, 비)\n\n녹슨 안내판 아래, 정수(50대)가 랜턴을 들고 서 있다.\n\n정수\n(혼잣말) 오늘도 안 오네.',
    author: 'writer1@vmp.dev',
    title: '마지막 열차',
    genre: '미스터리',
    logline: '폐역을 지키는 역무원이 25년 만에 도착한 열차의 비밀을 쫓는다.',
    synopsis:
      '1998년 부산 외곽의 폐역. 역무원 정수는 운행이 끊긴 뒤에도 매일 밤 승강장을 지킨다. 어느 비 오는 밤, 시간표에 없는 열차가 도착하고 그 안에서 실종된 동생의 가방이 발견된다.',
    fullText:
      'S#1. 폐역 승강장 (밤, 비)\n\n녹슨 안내판 아래, 정수(50대)가 랜턴을 들고 서 있다.\n\n정수\n(혼잣말) 오늘도 안 오네.\n\n멀리서 기적 소리. 정수의 랜턴이 흔들린다.\n\nS#2. 열차 객실 (밤)\n\n텅 빈 객실. 좌석 위에 젖은 학생 가방 하나.',
    summary: {
      summary:
        '1998년 부산의 폐역을 지키는 역무원 정수 앞에 시간표에 없는 열차가 도착한다. 열차 안에서 25년 전 실종된 동생의 가방을 발견한 그는 과거의 사건을 다시 파헤치기 시작한다.',
      tags: ['미스터리', '실종', '1990년대 부산', '가족', '서스펜스'],
      contentRating: '12',
    },
  },
  {
    id: 'seed_script_rooftop_kitchen',
    author: 'writer1@vmp.dev',
    title: '옥상 위 부엌',
    genre: '드라마',
    logline: '폐업 직전의 셰프가 옥탑방 이웃들에게 밥을 해주며 다시 요리를 시작한다.',
    synopsis:
      '서울 망원동의 낡은 빌라. 식당을 접은 셰프 미란은 옥탑방에서 혼자 지낸다. 아래층 고시생, 배달 기사, 할머니와 한 끼씩 나누는 동안 그녀는 잃어버린 맛을 다시 찾아간다.',
    fullText:
      'S#1. 옥탑방 (아침)\n\n미란(40대)이 빈 냄비를 바라본다.\n\n미란\n한 그릇만 끓이는 건 어렵네.\n\n노크 소리. 문밖에 고시생 지우가 서 있다.',
    summary: {
      summary:
        '식당을 접고 옥탑방에서 지내는 셰프 미란이 이웃들과 밥을 나누며 다시 요리할 이유를 찾는 이야기. 각자의 사정을 가진 이웃들이 한 식탁에 모이면서 작은 공동체가 생겨난다.',
      tags: ['드라마', '음식', '이웃', '힐링', '서울'],
      contentRating: 'ALL',
    },
  },
  {
    id: 'seed_script_signal_lost',
    author: 'writer2@vmp.dev',
    title: '신호 두절',
    genre: 'SF',
    logline: '통신이 끊긴 남극 기지에서 대원들이 서로를 의심하기 시작한다.',
    synopsis:
      '2041년 남극 세종기지. 위성 통신이 끊긴 지 3일째, 기지 대원 한 명이 사라진다. 남은 다섯 명은 고립된 기지 안에서 서로를 의심하고, 외부와 연락할 마지막 방법을 찾는다.',
    fullText:
      'S#1. 세종기지 통신실 (낮인지 밤인지 모를 백야)\n\n지직거리는 모니터. 통신 담당 서윤이 헤드셋을 벗는다.\n\n서윤\n아무것도 안 잡혀요. 72시간째.',
    summary: {
      summary:
        '2041년, 통신이 끊긴 남극 기지에서 대원 한 명이 사라지고 남은 대원들이 서로를 의심하게 된다. 고립과 불신 속에서 이들은 외부와 연락할 마지막 방법을 찾아야 한다.',
      tags: ['SF', '고립', '남극', '스릴러', '근미래'],
      contentRating: '15',
    },
  },
];

async function main() {
  const ids = new Map<string, string>();
  for (const { password, coins, public: isPublic, ...u } of SEED_USERS) {
    const passwordHash = await hash(password);
    const profile = {
      displayName: u.displayName,
      roles: u.roles,
      bio: u.bio ?? null,
      profilePublic: Boolean(isPublic),
      emailPublic: Boolean(isPublic),
      status: u.status ?? 'ACTIVE',
      suspendReason: u.suspendReason ?? null,
      suspendedAt: u.status === 'SUSPENDED' ? new Date() : null,
      passwordHash,
    };
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: profile })
      : await prisma.user.create({ data: { email: u.email, ...profile, coinBalance: coins } });
    // 코인은 처음 만들 때만 지급 (다시 시드해도 사용 내역을 덮어쓰지 않게)
    if (!existing && coins > 0) {
      await prisma.coinTransaction.create({
        data: { userId: user.id, type: 'ADMIN_ADJUST', amount: coins, balanceAfter: coins, memo: '시드 지급' },
      });
    }
    ids.set(u.email, user.id);
  }

  const now = new Date();
  for (const { author, summary, ...s } of scripts) {
    const data = {
      ...s,
      authorId: ids.get(author)!,
      status: 'PUBLISHED' as const,
      rightsDeclared: true,
      rightsDeclaredAt: now,
      aiSummary: { ...summary, model: 'seed', generatedAt: now.toISOString() },
      // 예시 대본은 작가가 요약에 동의하고 읽어 본 뒤 공개한 것으로 둔다
      aiSummaryConsent: true,
      aiSummaryConsentAt: now,
      aiSummaryPublic: true,
    };
    await prisma.script.upsert({ where: { id: s.id }, update: data, create: data });
  }
  await seedCasting(ids);

  // 관리자 신고 화면 확인용 예시 신고 (처리 전). 이미 있으면 다시 만들지 않는다
  const sampleReports = [
    { reporter: 'writer2@vmp.dev', target: 'member1@vmp.dev', reason: 'SPAM' as const, details: '제작 문의를 가장한 홍보 링크를 보냈습니다.' },
    { reporter: 'producer2@vmp.dev', target: 'member1@vmp.dev', reason: 'ABUSE' as const, details: '협상 중 욕설을 했습니다.' },
  ];
  for (const r of sampleReports) {
    const reporterId = ids.get(r.reporter)!;
    const targetId = ids.get(r.target)!;
    const exists = await prisma.accountReport.findFirst({ where: { reporterId, targetId } });
    if (!exists) {
      await prisma.accountReport.create({ data: { reporterId, targetId, reason: r.reason, details: r.details } });
    }
  }

  console.log(`시드 완료: 사용자 ${SEED_USERS.length}명, 공개 대본 ${scripts.length}편, 예시 신고 ${sampleReports.length}건, 출연자 3명과 캐스팅 시범 작품`);
}

// --- 출연자·캐스팅 시범 데이터 (docs/policies/likeness-policy.md) -------------------------
// 얼굴 스캔은 개발용 키로 암호화한 가짜 파일이다. 실제 사람의 얼굴·목소리는 넣지 않는다.
const DAY = 86_400_000;

async function seedCasting(ids: Map<string, string>) {
  const vault = vaultFromEnv();
  const id = (email: string) => ids.get(email)!;
  const birth = (age: number) => new Date(Date.UTC(new Date().getUTCFullYear() - age, 0, 15));

  async function registered(email: string, o: { kind: 'ACTOR' | 'GENERAL'; stageName: string; legalName: string; age: number; allowedTags: ContentTag[]; minFeeKrw: number; guardianEmail?: string }) {
    const userId = id(email);
    const minor = o.age < 19;
    const identity = { provider: 'seed', legalName: o.legalName, isMinor: minor, adultOn: minor ? adultOnFrom(birth(o.age)) : null };
    await prisma.identityVerification.upsert({ where: { userId }, update: identity, create: { userId, ...identity } });
    const guardian = o.guardianEmail
      ? { guardianEmail: o.guardianEmail, guardianId: id(o.guardianEmail), guardianConsentAt: new Date(), guardianVerifiedAt: new Date() }
      : {};
    const data = {
      kind: o.kind,
      stageName: o.stageName,
      bio: `${o.stageName}의 시범 프로필`,
      status: 'ACTIVE' as const,
      allowedTags: o.allowedTags,
      minFeeKrw: o.minFeeKrw,
      livenessVerifiedAt: new Date(),
      consentVersion: POLICY_VERSION,
      consentedAt: new Date(),
      withdrawRequestedAt: null,
      purgeAfter: null,
      withdrawnAt: null,
      ...guardian,
    };
    const profile = await prisma.talentProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    const hasFace = await prisma.likenessAsset.count({ where: { talentId: profile.id, kind: 'FACE_SCAN', status: 'ACTIVE' } });
    if (!hasFace) {
      const bytes = Buffer.from(`seed face scan of ${o.stageName}`);
      await prisma.likenessAsset.create({
        data: { talentId: profile.id, kind: 'FACE_SCAN', contentType: 'image/jpeg', sizeBytes: bytes.length, ...(await vault.store(bytes)) },
      });
    }
    return profile;
  }

  await prisma.identityVerification.upsert({
    where: { userId: id('guardian1@vmp.dev') },
    update: {},
    create: { userId: id('guardian1@vmp.dev'), provider: 'seed', legalName: '윤보호', isMinor: false },
  });
  const actor = await registered('talent1@vmp.dev', {
    kind: 'ACTOR', stageName: '한별', legalName: '최한별', age: 26, allowedTags: ['ROMANCE', 'VIOLENCE', 'PROFANITY'], minFeeKrw: 200_000,
  });
  await registered('talent2@vmp.dev', { kind: 'GENERAL', stageName: '도윤', legalName: '정도윤', age: 31, allowedTags: ['ROMANCE'], minFeeKrw: 0 });
  const kid = await registered('kid1@vmp.dev', {
    kind: 'ACTOR', stageName: '서아', legalName: '윤서아', age: 14, allowedTags: ['ROMANCE'], minFeeKrw: 100_000, guardianEmail: 'guardian1@vmp.dev',
  });

  // "마지막 열차"로 김작가(writer1)와 박제작(producer1)이 맺은 딜 → 작품
  const writerId = id('writer1@vmp.dev');
  const producerId = id('producer1@vmp.dev');
  const scriptId = 'seed_script_last_train';
  await prisma.negotiation.upsert({
    where: { id: 'seed_neg_last_train' },
    update: {},
    create: { id: 'seed_neg_last_train', scriptId, writerId, producerId, status: 'AGREED' },
  });
  await prisma.offer.upsert({
    where: { id: 'seed_offer_last_train' },
    update: {},
    create: {
      id: 'seed_offer_last_train', negotiationId: 'seed_neg_last_train', proposerId: producerId,
      writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 3_000_000, termMonths: 24, exclusive: true, status: 'ACCEPTED',
    },
  });
  await prisma.deal.upsert({
    where: { id: 'seed_deal_last_train' },
    update: {},
    create: { id: 'seed_deal_last_train', negotiationId: 'seed_neg_last_train', acceptedOfferId: 'seed_offer_last_train' },
  });
  await prisma.license.upsert({
    where: { id: 'seed_license_last_train' },
    update: {},
    create: {
      id: 'seed_license_last_train', dealId: 'seed_deal_last_train', scriptId, licenseeId: producerId,
      scope: '작가 50% / 제작자 50%, 선급금 3,000,000원, 24개월, 독점',
    },
  });
  // 계약 기능 전에 만든 시드 딜에도 3자 이용허락 계약서를 붙인다 (플랫폼은 서명, 작가·제작자는 서명 대기라 화면에서 서명해 볼 수 있다)
  const hasLicense = await prisma.contract.findFirst({ where: { dealId: 'seed_deal_last_train', kind: 'SCRIPT_LICENSE' } });
  if (!hasLicense) {
    const [w, pr] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: writerId }, select: { displayName: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: producerId }, select: { displayName: true } }),
    ]);
    const platform = process.env.PLATFORM_LEGAL_NAME?.trim() || '대본매칭 운영자';
    const doc = renderScriptLicense({
      scriptTitle: '마지막 열차',
      scriptId,
      parties: [
        { role: 'WRITER', name: w.displayName, revenueShareBp: 5_000, receivesRemainder: false },
        { role: 'PRODUCER', name: pr.displayName, revenueShareBp: 5_000, receivesRemainder: true },
        { role: 'PLATFORM', name: platform, revenueShareBp: null, receivesRemainder: false },
      ],
      upfrontFeeKrw: 3_000_000,
      termMonths: 24,
      exclusive: true,
      notes: null,
      date: new Date(),
    });
    await prisma.contract.create({
      data: {
        kind: doc.kind,
        templateVersion: doc.templateVersion,
        title: doc.title,
        body: doc.body,
        bodySha256: sha256(doc.body),
        dealId: 'seed_deal_last_train',
        parties: {
          create: [
            { role: 'WRITER', userId: writerId, legalName: w.displayName, revenueShareBp: 5_000 },
            { role: 'PRODUCER', userId: producerId, legalName: pr.displayName, revenueShareBp: 5_000, receivesRemainder: true },
            { role: 'PLATFORM', userId: null, legalName: platform, signedAt: new Date(), signedName: platform, userAgent: 'platform' },
          ],
        },
      },
    });
  }
  await prisma.project.upsert({
    where: { id: 'seed_project_last_train' },
    update: {},
    create: { id: 'seed_project_last_train', dealId: 'seed_deal_last_train', title: '마지막 열차 (유튜브 6부작)' },
  });

  // 1) 정수 역: 한별과 계약됨, 1화 초안이 출연분 확인을 기다림
  await prisma.castingRole.upsert({
    where: { id: 'seed_role_jeongsu' },
    update: {},
    create: { id: 'seed_role_jeongsu', projectId: 'seed_project_last_train', name: '정수 (역무원)', description: '폐역을 지키는 50대 역무원', contentTags: ['ROMANCE'], status: 'CAST' },
  });
  await prisma.castingNegotiation.upsert({
    where: { id: 'seed_cneg_jeongsu' },
    update: {},
    create: { id: 'seed_cneg_jeongsu', roleId: 'seed_role_jeongsu', talentId: actor.id, initiatedBy: 'STUDIO', status: 'AGREED' },
  });
  await prisma.castingOffer.upsert({
    where: { id: 'seed_coffer_jeongsu' },
    update: {},
    create: {
      id: 'seed_coffer_jeongsu', negotiationId: 'seed_cneg_jeongsu', proposerId: producerId, side: 'STUDIO', feeType: 'FLAT', flatFeeKrw: 300_000,
      usage: 'DIGITAL', termMonths: 12, exclusive: false, productionDays: 30, status: 'ACCEPTED', respondedAt: new Date(),
    },
  });
  const startsAt = new Date();
  await prisma.castingContract.upsert({
    where: { id: 'seed_contract_jeongsu' },
    update: {},
    create: {
      id: 'seed_contract_jeongsu', negotiationId: 'seed_cneg_jeongsu', offerId: 'seed_coffer_jeongsu', projectId: 'seed_project_last_train',
      roleId: 'seed_role_jeongsu', talentId: actor.id, feeType: 'FLAT', flatFeeKrw: 300_000, perEpisodeFeeKrw: 0, revenueSharePct: 0,
      usage: 'DIGITAL', contentTags: ['ROMANCE'], exclusive: false, requiresTalentApproval: true, earlyTerminationPct: 50,
      startsAt, productionEndsAt: new Date(startsAt.getTime() + 30 * DAY), endsAt: new Date(startsAt.getTime() + 365 * DAY),
    },
  });
  // 다시 시드하면 시범 장면을 처음 상태(공개 전, 확인 대기)로 되돌린다
  await prisma.takedownRequest.deleteMany({ where: { workId: 'seed_work_ep1' } });
  await prisma.work.upsert({
    where: { id: 'seed_work_ep1' },
    update: { status: 'DRAFT', externalUrl: null, publishedAt: null },
    create: {
      id: 'seed_work_ep1', projectId: 'seed_project_last_train', title: '마지막 열차 1화', contentTags: ['ROMANCE'],
      appearances: { create: { contractId: 'seed_contract_jeongsu' } },
    },
  });

  await prisma.workAppearance.updateMany({ where: { workId: 'seed_work_ep1' }, data: { approvedAt: null } });

  // 2) 수아 역 (미성년 배역): 서아에게 회당 5만 원 × 6회 제안, 보호자 승인 대기
  await prisma.castingContract.deleteMany({ where: { id: { not: 'seed_contract_jeongsu' }, projectId: 'seed_project_last_train', roleId: 'seed_role_sua', appearances: { none: {} } } });
  await prisma.castingRole.upsert({
    where: { id: 'seed_role_sua' },
    update: {},
    create: { id: 'seed_role_sua', projectId: 'seed_project_last_train', name: '수아 (정수의 조카, 중학생)', isMinorRole: true, contentTags: ['ROMANCE'] },
  });
  await prisma.castingRole.update({ where: { id: 'seed_role_sua' }, data: { status: 'OPEN' } });
  await prisma.castingNegotiation.upsert({
    where: { id: 'seed_cneg_sua' },
    update: { status: 'OPEN' },
    create: { id: 'seed_cneg_sua', roleId: 'seed_role_sua', talentId: kid.id, initiatedBy: 'STUDIO' },
  });
  await prisma.castingOffer.upsert({
    where: { id: 'seed_coffer_sua' },
    update: {},
    create: {
      id: 'seed_coffer_sua', negotiationId: 'seed_cneg_sua', proposerId: producerId, side: 'STUDIO', feeType: 'PER_EPISODE', perEpisodeFeeKrw: 50_000,
      episodes: 6, usage: 'DIGITAL', termMonths: 12, exclusive: false, productionDays: 45, status: 'PENDING_GUARDIAN', note: '디지털 출연만, 학교 일정과 무관',
    },
  });
  await prisma.castingOffer.update({ where: { id: 'seed_coffer_sua' }, data: { status: 'PENDING_GUARDIAN', respondedAt: null } });
  await prisma.castingOffer.deleteMany({ where: { negotiationId: 'seed_cneg_sua', id: { not: 'seed_coffer_sua' } } });

  // 3) 공개 오디션
  await prisma.castingRole.upsert({
    where: { id: 'seed_role_passenger' },
    update: {},
    create: { id: 'seed_role_passenger', projectId: 'seed_project_last_train', name: '마지막 승객', description: '누구나 지원 가능', contentTags: ['ROMANCE'] },
  });
}


try {
  await main();
} finally {
  await prisma.$disconnect();
}
