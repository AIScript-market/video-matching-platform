// 개발용 시드. 여러 번 실행해도 같은 결과가 되도록 upsert한다.
// 계정 종류는 일반·관리자 두 가지. 대본 제공·영상 제작은 프로필과 이메일을 공개한 일반 계정이 한다.
//   관리자                admin@vmp.dev       / admin1234!
//   일반 (공개, 대본 제공) writer1@vmp.dev, writer2@vmp.dev     / writer1234!
//   일반 (공개, 영상 제작) producer1@vmp.dev, producer2@vmp.dev / producer1234!
//   일반 (비공개)          member1@vmp.dev     / member1234!
//   정지된 계정            suspended1@vmp.dev  / member1234!  (로그인·같은 이메일 재가입 불가)
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Role, type UserStatus } from '../src/generated/prisma/client.js';

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
];

const scripts = [
  {
    id: 'seed_script_last_train',
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
    };
    await prisma.script.upsert({ where: { id: s.id }, update: data, create: data });
  }
  console.log(`시드 완료: 사용자 ${SEED_USERS.length}명, 공개 대본 ${scripts.length}편`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
