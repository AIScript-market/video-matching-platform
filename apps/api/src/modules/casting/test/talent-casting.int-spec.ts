/**
 * 출연자 등록 → 캐스팅 → 계약 → 작품 공개 → 내림·철회 통합 테스트 (실제 PostgreSQL 필요).
 * DATABASE_URL이 없으면 건너뛴다. 테스트 데이터는 고유 접미사로 만들고 끝나면 지운다.
 */
import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { addDays, POLICY_VERSION, type ContentTag } from '../../talent/likeness-policy.js';
import { InMemoryStorage, LikenessVault } from '../../talent/likeness-vault.js';
import { TalentService, type TalentUser } from '../../talent/talent.service.js';
import { FakeIdentityVerifier, FakeLivenessChecker } from '../../talent/verification.js';
import { WorksService } from '../../works/works.service.js';
import type { CreateCastingOfferDto } from '../casting.dto.js';
import { CastingService } from '../casting.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const FACE = { buffer: Buffer.from('FACE-SCAN'), mimetype: 'image/jpeg', size: 9 };
const SELFIE = { buffer: Buffer.from('SELFIE'), size: 6 };
const URL = 'https://www.youtube.com/watch?v=abcdefghijk';
const consent = { policyVersion: POLICY_VERSION, sensitiveData: true, crossBorder: true };

function birthDateForAge(age: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const terms = (o: Partial<CreateCastingOfferDto> = {}): CreateCastingOfferDto => ({
  feeType: 'FLAT',
  flatFeeKrw: 300_000,
  usage: 'DIGITAL',
  termMonths: 12,
  exclusive: false,
  productionDays: 30,
  ...o,
});

run('출연자·캐스팅 흐름 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let storage: InMemoryStorage;
  let talent: TalentService;
  let casting: CastingService;
  let works: WorksService;
  const userIds: string[] = [];
  const scriptIds: string[] = [];
  let seq = 0;

  async function makeUser(name: string, roles: Array<'ADMIN'> = []): Promise<TalentUser> {
    seq++;
    const u = await prisma.user.create({
      data: { email: `${name}${seq}-${suffix}@test.local`, passwordHash: 'x', displayName: `${name}${seq}`, roles },
    });
    userIds.push(u.id);
    return { id: u.id, email: u.email, roles };
  }

  /** 등록을 마친 출연자. 미성년자는 확인된 보호자까지 */
  async function makeTalent(o: { minor?: boolean; allowedTags?: ContentTag[]; minFeeKrw?: number } = {}) {
    const user = await makeUser('talent');
    const guardian = o.minor ? await makeUser('guardian') : null;
    await talent.verifyIdentity(user, `test:출연자:${birthDateForAge(o.minor ? 15 : 25)}`);
    const profile = await talent.createProfile(user, {
      kind: 'ACTOR',
      stageName: `배우${seq}`,
      allowedTags: o.allowedTags ?? ['ROMANCE', 'VIOLENCE'],
      minFeeKrw: o.minFeeKrw ?? 0,
      guardianEmail: guardian?.email,
    });
    await talent.uploadAsset(user, 'FACE_SCAN', FACE);
    await talent.verifyLiveness(user, SELFIE);
    await talent.consent(user, consent);
    if (guardian) {
      await talent.verifyIdentity(guardian, `test:보호자:${birthDateForAge(45)}`);
      await talent.guardianConsent(guardian, profile.id);
      await talent.verifyGuardianRelationship(profile.id);
    }
    return { user, talentId: profile.id, guardian };
  }

  /** 작가·제작자 딜 (대본 → 협상 → 제안 → 딜) */
  async function makeDeal() {
    const writer = await makeUser('writer');
    const producer = await makeUser('producer');
    const script = await prisma.script.create({
      data: { authorId: writer.id, title: '테스트 대본', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'S#1', status: 'PUBLISHED', rightsDeclared: true },
    });
    scriptIds.push(script.id);
    const negotiation = await prisma.negotiation.create({ data: { scriptId: script.id, writerId: writer.id, producerId: producer.id, status: 'AGREED' } });
    const offer = await prisma.offer.create({
      data: { negotiationId: negotiation.id, proposerId: producer.id, writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 0, termMonths: 12, exclusive: false, status: 'ACCEPTED' },
    });
    const deal = await prisma.deal.create({ data: { negotiationId: negotiation.id, acceptedOfferId: offer.id } });
    return { writer, producer, deal };
  }

  async function studio(roleTags: ContentTag[] = ['ROMANCE'], isMinorRole = false) {
    const { writer, producer, deal } = await makeDeal();
    const project = await casting.createProject(producer, deal.id, { title: '단막 프로젝트' });
    const role = await casting.createRole(writer, project.id, { name: '배역', contentTags: roleTags, isMinorRole });
    return { writer, producer, deal, project, role };
  }

  async function contracted(o: { requiresTalentApproval?: boolean } = {}) {
    const s = await studio();
    const t = await makeTalent();
    const n = await casting.invite(s.producer, s.role.id, t.talentId);
    const offer = await casting.createOffer(s.producer, n.id, terms({ requiresTalentApproval: o.requiresTalentApproval ?? true }));
    const result = await casting.accept(t.user, offer.id);
    return { ...s, t, contract: result.contract! };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    storage = new InMemoryStorage();
    talent = new TalentService(prisma, new FakeIdentityVerifier(), new FakeLivenessChecker(), new LikenessVault(randomBytes(32), storage));
    casting = new CastingService(prisma, talent);
    works = new WorksService(prisma, casting);
  });

  afterAll(async () => {
    const dealIds = (await prisma.deal.findMany({ where: { negotiation: { scriptId: { in: scriptIds } } }, select: { id: true } })).map((d) => d.id);
    const projectIds = (await prisma.project.findMany({ where: { dealId: { in: dealIds } }, select: { id: true } })).map((p) => p.id);
    await prisma.takedownRequest.deleteMany({ where: { work: { projectId: { in: projectIds } } } });
    await prisma.work.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.likenessAccessLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.castingContract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.castingRole.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.contract.deleteMany({ where: { OR: [{ dealId: { in: dealIds } }, { parties: { some: { userId: { in: userIds } } } }] } });
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.offer.deleteMany({ where: { negotiation: { scriptId: { in: scriptIds } } } });
    await prisma.negotiation.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } });
    await prisma.talentProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('등록', () => {
    it('본인인증 → 얼굴 스캔 → 셀카 → 동의를 마치면 ACTIVE, 캐스팅 목록에는 실명이 없다', async () => {
      const user = await makeUser('newbie');
      await talent.createProfile(user, { kind: 'GENERAL', stageName: '한별', allowedTags: ['ROMANCE'] });
      expect((await talent.me(user)).missingSteps).toEqual(['IDENTITY', 'FACE_SCAN', 'LIVENESS', 'CONSENT']);
      await expect(talent.uploadAsset(user, 'FACE_SCAN', FACE)).rejects.toBeInstanceOf(BadRequestException);
      expect(await talent.verifyIdentity(user, `test:김한별:${birthDateForAge(24)}`)).toMatchObject({ legalName: '김한별', isMinor: false, adultOn: null });
      const asset = await talent.uploadAsset(user, 'FACE_SCAN', FACE);
      const row = await prisma.likenessAsset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(storage.files.get(row.storageKey)!.includes(FACE.buffer)).toBe(false);
      await expect(talent.verifyLiveness(user, { buffer: Buffer.from('MISMATCH'), size: 8 })).rejects.toThrow(/일치하지 않습니다/);
      await expect(talent.verifyLiveness(user, { buffer: Buffer.from('NOT-LIVE'), size: 8 })).rejects.toThrow(/실시간/);
      await talent.verifyLiveness(user, SELFIE);
      const done = await talent.consent(user, consent);
      expect(done).toMatchObject({ status: 'ACTIVE', missingSteps: [] });
      const listed = (await talent.directory({})).find((t) => t.id === done.id);
      expect(listed).toBeDefined();
      expect(JSON.stringify(listed)).not.toContain('김한별');
      await expect(talent.verifyIdentity(user, `test:다른사람:${birthDateForAge(24)}`)).rejects.toBeInstanceOf(ConflictException);
    });

    it('관리자 계정은 출연자로 등록할 수 없다', async () => {
      const admin = await makeUser('admin', ['ADMIN']);
      await expect(talent.createProfile(admin, { kind: 'ACTOR', stageName: 'x', allowedTags: [] })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('미성년자는 성인 보호자의 동의와 관리자 확인까지 마쳐야 ACTIVE', async () => {
      const user = await makeUser('kid');
      const guardian = await makeUser('parent');
      const teen = await makeUser('teen');
      const profile = await talent.createProfile(user, { kind: 'ACTOR', stageName: '아역', allowedTags: [], guardianEmail: guardian.email });
      await talent.verifyIdentity(user, `test:아역:${birthDateForAge(12)}`);
      await talent.uploadAsset(user, 'FACE_SCAN', FACE);
      await talent.verifyLiveness(user, SELFIE);
      await talent.consent(user, consent);
      expect((await talent.me(user)).missingSteps).toEqual(['GUARDIAN_LINK', 'GUARDIAN_CONSENT', 'GUARDIAN_VERIFIED']);
      await expect(talent.guardianConsent(guardian, profile.id)).rejects.toBeInstanceOf(BadRequestException); // 보호자 본인인증 전
      await talent.verifyIdentity(teen, `test:십대:${birthDateForAge(17)}`);
      await expect(talent.guardianConsent(teen, profile.id)).rejects.toBeInstanceOf(ForbiddenException);
      await talent.verifyIdentity(guardian, `test:보호자:${birthDateForAge(40)}`);
      await talent.guardianConsent(guardian, profile.id);
      await talent.verifyGuardianRelationship(profile.id);
      expect((await talent.me(user)).status).toBe('ACTIVE');
    });
  });

  describe('캐스팅', () => {
    it('허용하지 않은 장면 유형, 미성년자 금지 유형, 최저 출연료를 막는다', async () => {
      const s = await studio(['INTIMACY']);
      const t = await makeTalent({ allowedTags: ['ROMANCE'] });
      await expect(casting.invite(s.producer, s.role.id, t.talentId)).rejects.toThrow(/INTIMACY/);
      await expect(casting.createRole(s.producer, s.project.id, { name: '학생', isMinorRole: true, contentTags: ['INTIMACY'] })).rejects.toBeInstanceOf(BadRequestException);

      const sub = await casting.createRole(s.producer, s.project.id, { name: '술꾼', contentTags: ['SUBSTANCE'] });
      const kid = await makeTalent({ minor: true, allowedTags: ['SUBSTANCE'] });
      await expect(casting.invite(s.producer, sub.id, kid.talentId)).rejects.toThrow(/미성년자/);

      const plain = await casting.createRole(s.producer, s.project.id, { name: '행인', contentTags: [] });
      const pricey = await makeTalent({ minFeeKrw: 500_000 });
      const n = await casting.invite(s.producer, plain.id, pricey.talentId);
      await expect(casting.createOffer(s.producer, n.id, terms({ flatFeeKrw: 300_000 }))).rejects.toThrow(/최저 출연료/);
      await expect(casting.createOffer(s.producer, n.id, terms({ feeType: 'PER_EPISODE', perEpisodeFeeKrw: 100_000, episodes: 6 }))).resolves.toBeDefined();
    });

    it('역제안 후 상대가 수락하면 계약, 배역은 CAST, 다른 지원자 협상은 종료', async () => {
      const s = await studio();
      const a = await makeTalent();
      const b = await makeTalent();
      const n = await casting.apply(a.user, s.role.id, '지원합니다');
      const rival = await casting.apply(b.user, s.role.id);
      await casting.createOffer(b.user, rival.id, terms({ flatFeeKrw: 100_000 }));

      const first = await casting.createOffer(s.producer, n.id, terms({ flatFeeKrw: 200_000 }));
      const counter = await casting.createOffer(a.user, n.id, terms({ flatFeeKrw: 350_000 }));
      expect((await casting.getNegotiation(s.producer, n.id)).offers.map((o) => o.status)).toEqual(['COUNTERED', 'PROPOSED']);
      await expect(casting.accept(a.user, counter.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(casting.accept(a.user, first.id)).rejects.toBeInstanceOf(ConflictException);

      const result = await casting.accept(s.writer, counter.id);
      expect(result.status).toBe('CONTRACTED');
      expect(result.contract).toMatchObject({ talentId: a.talentId, flatFeeKrw: 350_000, contentTags: ['ROMANCE'], status: 'ACTIVE' });
      expect((await casting.listRoles(s.producer, s.project.id))[0]!.status).toBe('CAST');
      const closed = await casting.getNegotiation(b.user, rival.id);
      expect(closed.status).toBe('CLOSED');
      expect(closed.offers[0]!.status).toBe('WITHDRAWN');

      const outsider = await makeUser('outsider');
      await expect(casting.getNegotiation(outsider, n.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('미성년자가 수락하면 보호자를 기다리고, 보호자가 승인하면 계약된다', async () => {
      const s = await studio(['ROMANCE'], true);
      const kid = await makeTalent({ minor: true });
      const n = await casting.invite(s.producer, s.role.id, kid.talentId);
      expect(n.talentIsMinor).toBe(true);
      const offer = await casting.createOffer(s.producer, n.id, terms());
      expect(await casting.accept(kid.user, offer.id)).toMatchObject({ status: 'PENDING_GUARDIAN', contract: null });
      await expect(casting.guardianDecision(kid.user, offer.id, true)).rejects.toBeInstanceOf(ForbiddenException);
      const done = await casting.guardianDecision(kid.guardian!, offer.id, true);
      expect(done.status).toBe('CONTRACTED');
      expect(done.contract!.guardianApprovedAt).not.toBeNull();
    });

    it('같은 제안을 동시에 두 번 수락해도 계약은 하나', async () => {
      const s = await studio();
      const t = await makeTalent();
      const n = await casting.invite(s.producer, s.role.id, t.talentId);
      const offer = await casting.createOffer(s.producer, n.id, terms());
      const results = await Promise.allSettled([casting.accept(t.user, offer.id), casting.accept(t.user, offer.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.castingContract.count({ where: { negotiationId: n.id } })).toBe(1);
    });
  });

  describe('작품', () => {
    it('출연분 확인과 AI 표시가 있어야 공개되고, 계약 밖 장면은 등록부터 막힌다', async () => {
      const { producer, project, contract, t } = await contracted();
      await expect(works.create(producer, project.id, { title: '1화', contentTags: ['INTIMACY'], contractIds: [contract.id] })).rejects.toBeInstanceOf(ConflictException);
      const work = await works.create(producer, project.id, { title: '1화', contentTags: ['ROMANCE'], contractIds: [contract.id] });
      await expect(works.publish(producer, work.id, { externalUrl: URL, syntheticLabelApplied: true })).rejects.toBeInstanceOf(ConflictException);
      expect((await works.listMine(t.user)).map((w) => w.id)).toEqual([work.id]);
      await works.approve(t.user, work.id);
      await expect(works.publish(producer, work.id, { externalUrl: URL, syntheticLabelApplied: false })).rejects.toBeInstanceOf(BadRequestException);
      expect((await works.publish(producer, work.id, { externalUrl: URL, syntheticLabelApplied: true })).status).toBe('PUBLISHED');
    });

    it('계약 위반 신고는 즉시 비공개, 단순 변심은 공개 유지 후 합의로 내린다', async () => {
      const { producer, project, contract, t } = await contracted({ requiresTalentApproval: false });
      const admin = await makeUser('admin', ['ADMIN']);
      const work = await works.create(producer, project.id, { title: '1화', contentTags: [], contractIds: [contract.id] });
      await works.publish(producer, work.id, { externalUrl: URL, syntheticLabelApplied: true });

      const whim = await works.requestTakedown(t.user, work.id, { reason: 'PERSONAL_WITHDRAWAL', details: '비율을 올려 주지 않으면 내려 주세요' });
      expect(whim.interimUnlisted).toBe(false);
      expect((await works.get(producer, work.id)).status).toBe('PUBLISHED');

      const report = await works.requestTakedown(t.user, work.id, { reason: 'OUT_OF_SCOPE', details: '합의 없는 장면' });
      expect(report.interimUnlisted).toBe(true);
      expect((await works.get(producer, work.id)).status).toBe('UNLISTED');
      await works.decide(admin, report.id, false, '계약 범위 안');
      expect((await works.get(producer, work.id)).status).toBe('PUBLISHED');

      await works.settle(producer, whim.id, '합의 후 내림');
      expect((await works.get(producer, work.id)).status).toBe('REMOVED');
    });
  });

  describe('원본 접근과 철회', () => {
    it('본인과 제작 기한 안의 기획사만 원본을 받고, 받을 때마다 기록된다', async () => {
      const { producer, writer, t, contract } = await contracted();
      const [asset] = (await talent.me(t.user)).assets;
      expect((await talent.readAsset(t.user, asset!.id)).bytes.equals(FACE.buffer)).toBe(true);
      expect((await talent.readAsset(producer, asset!.id)).bytes.equals(FACE.buffer)).toBe(true);
      const outsider = await makeUser('outsider');
      await expect(talent.readAsset(outsider, asset!.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await talent.accessLogs(t.user)).map((l) => l.purpose).sort()).toEqual(['PRODUCTION', 'SELF']);

      await prisma.castingContract.update({ where: { id: contract.id }, data: { productionEndsAt: new Date(Date.now() - 1000) } });
      await expect(talent.readAsset(writer, asset!.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('철회하면 새 협상이 막히고, 제작 기한 뒤에 원본과 키가 지워진다', async () => {
      const { t, contract } = await contracted();
      const withdrawn = await talent.withdraw(t.user);
      expect(withdrawn.status).toBe('WITHDRAWING');
      expect(withdrawn.purgeAfter!.toISOString()).toBe(contract.productionEndsAt.toISOString());

      expect((await talent.runMaintenance(addDays(new Date(), 1), [t.talentId])).purgedTalents).toBe(0);
      expect((await talent.runMaintenance(addDays(new Date(), 31), [t.talentId])).purgedTalents).toBe(1);
      const assets = await prisma.likenessAsset.findMany({ where: { talentId: t.talentId } });
      expect(assets.every((a) => a.status === 'DELETED' && a.wrappedKey === null && !storage.files.has(a.storageKey))).toBe(true);
      expect((await prisma.talentProfile.findUniqueOrThrow({ where: { id: t.talentId } })).status).toBe('WITHDRAWN');
    });

    it('계정을 탈퇴하면 정리 작업이 출연자 등록을 철회 처리한다', async () => {
      const t = await makeTalent();
      await prisma.user.update({ where: { id: t.user.id }, data: { status: 'WITHDRAWN' } });
      expect((await talent.runMaintenance(new Date(), [t.talentId])).withdrawnAccounts).toBe(1);
      expect((await prisma.talentProfile.findUniqueOrThrow({ where: { id: t.talentId } })).status).toBe('WITHDRAWING');
    });

    it('7일 안에는 철회를 취소할 수 있다', async () => {
      const t = await makeTalent();
      await talent.withdraw(t.user);
      expect(await talent.cancelWithdrawal(t.user)).toMatchObject({ status: 'ACTIVE', purgeAfter: null });
    });

    it('조기 종료 보상을 안내하고, 관리자가 종료하면 작품이 내려간다', async () => {
      const { producer, project, contract, t } = await contracted({ requiresTalentApproval: false });
      const work = await works.create(producer, project.id, { title: '1화', contentTags: [], contractIds: [contract.id] });
      expect(await casting.earlyTerminationQuote(t.user, contract.id)).toEqual({
        contractId: contract.id, refundKrw: 300_000, compensationKrw: 150_000, totalKrw: 450_000, affectedWorkIds: [work.id],
      });
      await expect(casting.earlyTerminationQuote(producer, contract.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await casting.terminate(contract.id, '보상금 입금 확인')).status).toBe('TERMINATED');
      expect((await works.get(producer, work.id)).status).toBe('REMOVED');
    });
  });
});
