/**
 * 흥행 판단 모델 데모 데이터 (개발 전용, 선택).
 *
 *   pnpm --filter api db:seed:ml-demo            # 만들기 (이미 있으면 지우고 다시)
 *   pnpm --filter api db:seed:ml-demo -- --remove # 지우기
 *
 * 실제 성과 데이터가 쌓이기 전에 "모델 학습 전 → 비슷한 성공작 → 확률" 흐름을 화면에서 확인하려고 만든 합성 데이터다.
 * 학습용 대본 200편(숨김, 학습 동의)과 각 대본의 공개 작품·성과, 추천 후보 대본 8편(공개)을 만든다.
 * 긴장감 있는 장면이 많은 대본일수록 채널 크기를 보정한 성과가 높게 나오도록 만들었다. 실제 시장을 반영하지 않는다.
 * 모든 데이터는 데모 작가 계정(mldemo@vmp.dev)에 묶여 있어 --remove로 한 번에 지운다.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_EMAIL = 'mldemo@vmp.dev';
const PRODUCER_EMAIL = 'producer2@vmp.dev';
const TRAINING_SCRIPTS = 200;
const CANDIDATES = 8;
const DAY = 86_400_000;

// 재현 가능한 난수 (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20261011);
const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

const GENRES = ['스릴러', '드라마', '로맨스', '코미디', 'SF', '미스터리'];
const NAMES = [
  ['민재', '수아'],
  ['지훈', '하나'],
  ['도윤', '서연'],
  ['태오', '유진'],
];
const TENSE = [
  'S#{n}. 폐공장 (밤)\n총성이 울린다. {a}가 숨을 멈춘다.\n{a}\n누가 배신했어?\n{b}\n처음부터 너였잖아!',
  'S#{n}. 옥상 (새벽)\n추격 끝에 {b}가 난간에 선다.\n{b}\n비밀은 이제 끝이야!\n{a}\n잠깐, 그 열쇠는 어디서 났어?',
  'S#{n}. 지하 주차장 (밤)\n정전. 어둠 속에서 발소리가 다가온다.\n{a}\n거기 누구야?\n{b}\n(속삭이며) 움직이지 마. 우리 말고 또 있어.',
  'S#{n}. 병원 복도 (새벽)\n{b}가 피 묻은 서류를 숨긴다. 경보가 울린다.\n{b}\n시간이 없어. 오늘 밤 안에 끝내야 해!',
];
const FLAT = [
  'S#{n}. 카페 (낮)\n{a}가 커피를 마신다. 창밖으로 사람들이 지나간다.\n{a}\n오늘 날씨 좋다.\n{b}\n응, 산책하기 좋겠다.',
  'S#{n}. 사무실 (오후)\n{a}가 서류를 정리한다. {b}가 간식을 건넨다.\n{b}\n이거 먹어.\n{a}\n고마워.',
  'S#{n}. 버스 정류장 (아침)\n{b}가 휴대폰으로 일정을 확인한다.\n{b}\n오늘은 회의가 세 개네.\n{a}\n점심은 같이 먹자.',
  'S#{n}. 집 거실 (저녁)\n{a}와 {b}가 텔레비전을 본다. 별일 없는 하루다.\n{a}\n내일 장 보러 갈까?',
];

/** 긴장도 tension(0~1)만큼 긴장감 있는 장면을 섞은 대본 */
function makeText(tension: number) {
  const [a, b] = pick(NAMES);
  const scenes = 6 + Math.floor(random() * 6);
  return Array.from({ length: scenes }, (_, i) =>
    (random() < tension ? pick(TENSE) : pick(FLAT)).replaceAll('{n}', String(i + 1)).replaceAll('{a}', a!).replaceAll('{b}', b!),
  ).join('\n\n');
}

async function remove() {
  const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!demo) return 0;
  const scriptIds = (await prisma.script.findMany({ where: { authorId: demo.id }, select: { id: true } })).map((s) => s.id);
  const dealIds = (await prisma.deal.findMany({ where: { negotiation: { scriptId: { in: scriptIds } } }, select: { id: true } })).map((d) => d.id);
  await prisma.project.deleteMany({ where: { dealId: { in: dealIds } } }); // 작품·성과 기록도 함께
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  await prisma.offer.deleteMany({ where: { negotiation: { scriptId: { in: scriptIds } } } });
  await prisma.negotiation.deleteMany({ where: { scriptId: { in: scriptIds } } });
  await prisma.script.deleteMany({ where: { id: { in: scriptIds } } }); // 대본 벡터도 함께
  await prisma.user.delete({ where: { id: demo.id } });
  return scriptIds.length;
}

async function create() {
  const producer = await prisma.user.findUnique({ where: { email: PRODUCER_EMAIL } });
  if (!producer) throw new Error(`${PRODUCER_EMAIL}이 없습니다. 먼저 pnpm --filter api db:seed`);
  const demo = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      // 로그인할 일이 없는 계정이라 비밀번호를 무작위로 둔다
      passwordHash: await hash(crypto.randomUUID()),
      displayName: '[데모] 학습 데이터',
      roles: [],
    },
  });

  const start = Date.now() - (TRAINING_SCRIPTS * 3 + 60) * DAY;
  for (let i = 0; i < TRAINING_SCRIPTS; i++) {
    const tension = random();
    const genre = pick(GENRES);
    const script = await prisma.script.create({
      data: {
        authorId: demo.id,
        title: `[데모] 학습 대본 ${i + 1}`,
        logline: '흥행 판단 모델 흐름 확인용 합성 데이터',
        synopsis: '학습 흐름 확인용 합성 데이터입니다. 실제 대본이 아닙니다.',
        genre,
        fullText: makeText(tension),
        status: 'HIDDEN',
        rightsDeclared: true,
        trainingConsent: true,
        trainingConsentAt: new Date(),
      },
    });
    const negotiation = await prisma.negotiation.create({
      data: { scriptId: script.id, writerId: demo.id, producerId: producer.id, status: 'AGREED' },
    });
    const offer = await prisma.offer.create({
      data: {
        negotiationId: negotiation.id,
        proposerId: producer.id,
        writerSharePct: 50,
        producerSharePct: 50,
        upfrontFeeKrw: 0,
        termMonths: 12,
        exclusive: false,
        status: 'ACCEPTED',
      },
    });
    const deal = await prisma.deal.create({ data: { negotiationId: negotiation.id, acceptedOfferId: offer.id } });
    const project = await prisma.project.create({ data: { dealId: deal.id, title: `[데모] 작품 ${i + 1}` } });
    const publishedAt = new Date(start + i * 3 * DAY);
    const work = await prisma.work.create({
      data: { projectId: project.id, title: `[데모] 작품 ${i + 1} 1화`, contentTags: [], status: 'PUBLISHED', publishedAt },
    });

    const channelSubscribers = pick([2_000, 20_000, 200_000]);
    const quality = Math.exp(1.6 * (tension - 0.5) + 0.5 * gaussian());
    const views = Math.round(channelSubscribers * 0.4 * quality);
    await prisma.workPerformanceSnapshot.create({
      data: {
        workId: work.id,
        capturedAt: new Date(publishedAt.getTime() + 30 * DAY),
        views,
        likes: Math.round(views * 0.03 * Math.sqrt(quality)),
        comments: Math.round(views * 0.004),
        positiveComments: Math.round(views * 0.002 * Math.sqrt(quality)),
        channelSubscribers,
        recordedById: producer.id,
        source: 'MANUAL',
      },
    });
  }

  for (let i = 0; i < CANDIDATES; i++) {
    const tension = i / (CANDIDATES - 1);
    await prisma.script.create({
      data: {
        authorId: demo.id,
        title: `[데모] 추천 후보 ${String.fromCharCode(65 + i)}`,
        logline: `긴장도 ${Math.round(tension * 100)}%로 만든 합성 대본 (추천 순서 확인용)`,
        synopsis: '추천 흐름 확인용 합성 데이터입니다. 실제 대본이 아닙니다.',
        genre: pick(GENRES),
        fullText: makeText(tension),
        status: 'PUBLISHED',
        rightsDeclared: true,
      },
    });
  }
}

const removed = await remove();
if (process.argv.includes('--remove')) {
  console.log(`[ml-demo] 데모 대본 ${removed}편을 지웠습니다`);
} else {
  await create();
  console.log(
    `[ml-demo] 학습 대본 ${TRAINING_SCRIPTS}편과 추천 후보 ${CANDIDATES}편을 만들었습니다. 관리자 화면(/admin/ml)에서 "바뀐 대본 벡터화" → "학습"을 누르세요.`,
  );
}
await prisma.$disconnect();
