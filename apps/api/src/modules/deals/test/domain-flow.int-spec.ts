/**
 * 작가-제작자 중개 전체 흐름 통합 테스트 (실제 PostgreSQL 필요).
 * DATABASE_URL이 없으면 건너뛴다. 테스트 데이터는 고유 접미사로 만들고 끝나면 지운다.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AccessService } from '../../access/access.service.js';
import { ContractsService } from '../../contracts/contracts.service.js';
import type { Viewer } from '../../access/access-rules.js';
import { LedgerService } from '../../ledger/ledger.service.js';
import { NegotiationsService } from '../../negotiations/negotiations.service.js';
import { OffersService } from '../../negotiations/offers.service.js';
import { AiJobsQueue } from '../../scripts/ai-jobs.queue.js';
import { ScriptsService } from '../../scripts/scripts.service.js';
import { DealsService } from '../deals.service.js';
import { WalletService } from '../../wallet/wallet.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('도메인 흐름 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  const queued: string[] = [];
  let scripts: ScriptsService;
  let access: AccessService;
  let negotiations: NegotiationsService;
  let offers: OffersService;
  let deals: DealsService;
  let ledger: LedgerService;
  let contracts: ContractsService;
  let writer: Viewer, producer: Viewer, producer2: Viewer, admin: Viewer, outsider: Viewer;
  const userIds: string[] = [];

  async function makeUser(name: string, roles: Array<'WRITER' | 'PRODUCER' | 'ADMIN'>): Promise<Viewer> {
    const u = await prisma.user.create({
      data: { email: `${name}-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles, coinBalance: 1000 },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    const queue = { enqueueSummarize: async (id: string) => (queued.push(id), true) } as AiJobsQueue;
    const wallet = new WalletService(prisma);
    scripts = new ScriptsService(prisma, queue, wallet);
    contracts = new ContractsService(prisma);
    access = new AccessService(prisma, contracts);
    negotiations = new NegotiationsService(prisma, wallet);
    offers = new OffersService(prisma, negotiations, contracts);
    deals = new DealsService(prisma);
    ledger = new LedgerService(prisma, deals);
    writer = await makeUser('writer', ['WRITER']);
    producer = await makeUser('producer', ['PRODUCER']);
    producer2 = await makeUser('producer2', ['PRODUCER']);
    admin = await makeUser('admin', ['ADMIN']);
    outsider = await makeUser('outsider', ['WRITER', 'PRODUCER']);
  });

  afterAll(async () => {
    const scriptIds = (await prisma.script.findMany({ where: { authorId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
    const negIds = (await prisma.negotiation.findMany({ where: { scriptId: { in: scriptIds } }, select: { id: true } })).map((n) => n.id);
    const dealIds = (await prisma.deal.findMany({ where: { negotiationId: { in: negIds } }, select: { id: true } })).map((d) => d.id);
    await prisma.contract.deleteMany({ where: { OR: [{ dealId: { in: dealIds } }, { parties: { some: { userId: { in: userIds } } } }] } });
    await prisma.ledgerEntry.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.license.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.message.deleteMany({ where: { negotiationId: { in: negIds } } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.offer.deleteMany({ where: { negotiationId: { in: negIds } } });
    await prisma.negotiation.deleteMany({ where: { id: { in: negIds } } });
    await prisma.scriptAccessLog.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.scriptAccessRequest.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('작성 → 공개 → 열람 승인 → 협상 → 역제안 → 수락 → 딜 → 장부', async () => {
    // 1. 작성 (DRAFT, 비공개)
    const created = await scripts.create(writer, {
      title: '마지막 열차',
      logline: '폐역 역무원이 오지 않는 열차의 비밀을 쫓는다',
      synopsis: '1998년 부산. 폐역을 지키는 정수는...',
      genre: '미스터리',
      fullText: 'S#1. 폐역 승강장 (밤)',
    });
    expect(created.status).toBe('DRAFT');
    expect(created.fullText).toBe('S#1. 폐역 승강장 (밤)');
    await expect(scripts.get(created.id, producer)).rejects.toThrow(NotFoundException);
    expect((await scripts.list({}, null)).items.find((s) => s.id === created.id)).toBeUndefined();
    expect((await scripts.list({ mine: true }, writer)).items.map((s) => s.id)).toContain(created.id);

    // 2. 권리 진술 없이 공개 불가 → 진술과 함께 공개, 요약 작업 등록
    await expect(scripts.publish(created.id, writer, {})).rejects.toThrow(BadRequestException);
    await expect(scripts.publish(created.id, producer, { rightsDeclared: true })).rejects.toThrow(NotFoundException);
    const published = await scripts.publish(created.id, writer, { rightsDeclared: true });
    expect(published.status).toBe('PUBLISHED');
    expect(published.rightsDeclaredAt).toBeInstanceOf(Date);
    expect(queued).toContain(created.id);

    // 공개 목록·상세: 전문은 숨김
    const listed = await scripts.list({ genre: '미스터리' }, null);
    expect(listed.items.find((s) => s.id === created.id)).toBeDefined();
    expect(JSON.stringify(listed)).not.toContain('S#1');
    const publicView = await scripts.get(created.id, producer);
    expect(publicView.fullText).toBeNull();
    expect(publicView.viewer.canReadFullText).toBe(false);

    // 3. 열람 요청 (NDA 필수) → 승인 전에는 협상 불가 → 작가 승인 → 전문 열람 + 로그
    await expect(access.request(created.id, producer, { ndaAccepted: false })).rejects.toThrow(BadRequestException);
    await expect(access.request(created.id, writer, { ndaAccepted: true })).rejects.toThrow(BadRequestException);
    const req = await access.request(created.id, producer, { ndaAccepted: true }, { ip: '127.0.0.1', userAgent: 'vitest' });
    expect(req.status).toBe('PENDING');
    // 열람 요청과 함께 비밀유지 서약서가 서명된 채로 만들어지고, 보호받는 작가도 볼 수 있다
    const nda = await contracts.get(req.ndaContractId!, writer);
    expect(nda).toMatchObject({ kind: 'NDA', status: 'SIGNED' });
    expect(nda.body).toContain('「마지막 열차」');
    expect(nda.parties).toEqual([expect.objectContaining({ role: 'PRODUCER', userId: producer.id, signedName: 'producer' })]);
    await expect(contracts.get(nda.id, outsider)).rejects.toThrow(NotFoundException);
    await expect(access.request(created.id, producer, { ndaAccepted: true })).rejects.toThrow(ConflictException);
    await expect(negotiations.start(created.id, producer)).rejects.toThrow(ForbiddenException);
    expect((await access.list(writer, { as: 'writer' })).map((r) => r.id)).toContain(req.id);
    await expect(access.approve(req.id, producer)).rejects.toThrow(ForbiddenException);
    expect((await access.approve(req.id, writer)).status).toBe('APPROVED');
    await expect(access.reject(req.id, writer)).rejects.toThrow(ConflictException);

    const fullView = await scripts.get(created.id, producer);
    expect(fullView.fullText).toBe('S#1. 폐역 승강장 (밤)');
    await scripts.get(created.id, producer); // 곧바로 다시 열어도 열람 기록은 한 번
    expect(await prisma.scriptAccessLog.count({ where: { scriptId: created.id, userId: producer.id } })).toBe(1);

    // 4. 협상 시작 (재호출해도 같은 협상) + 채팅
    const neg = await negotiations.start(created.id, producer);
    expect((await negotiations.start(created.id, producer)).id).toBe(neg.id);
    expect(neg.writerId).toBe(writer.id);
    await expect(negotiations.get(neg.id, outsider)).rejects.toThrow(NotFoundException);
    const m1 = await negotiations.postMessage(neg.id, producer, { body: '안녕하세요, 영상화에 관심 있습니다.' });
    const m2 = await negotiations.postMessage(neg.id, writer, { body: '반갑습니다!' });
    expect((await negotiations.listMessages(neg.id, writer)).map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect((await negotiations.listMessages(neg.id, writer, m1.id)).map((m) => m.id)).toEqual([m2.id]);
    expect(await negotiations.listMessages(neg.id, writer, m2.id)).toEqual([]);
    // 메시지는 1건에 1코인
    expect((await prisma.user.findUniqueOrThrow({ where: { id: producer.id } })).coinBalance).toBe(999);

    // 5. 제안 → 역제안 → 수락
    const terms = { writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 3_000_000, termMonths: 24, exclusive: true };
    await expect(offers.create(neg.id, producer, { ...terms, producerSharePct: 60 })).rejects.toThrow(BadRequestException);
    const o1 = await offers.create(neg.id, producer, terms);
    await expect(offers.accept(o1.id, producer)).rejects.toThrow(ForbiddenException);
    const o2 = await offers.create(neg.id, writer, { ...terms, writerSharePct: 60, producerSharePct: 40, notes: '해외 판권 제외' });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe('COUNTERED');
    await expect(offers.accept(o1.id, writer)).rejects.toThrow(ConflictException);

    const result = await offers.accept(o2.id, producer);
    expect(result.offer.status).toBe('ACCEPTED');
    await expect(offers.accept(o2.id, producer)).rejects.toThrow(ConflictException);

    const detail = await negotiations.get(neg.id, writer);
    expect(detail.status).toBe('AGREED');
    expect(detail.dealId).toBe(result.dealId);
    expect(detail.offers.map((o) => o.status)).toEqual(['COUNTERED', 'ACCEPTED']);
    await expect(offers.create(neg.id, producer, terms)).rejects.toThrow(ConflictException);

    // 6. 딜·라이선스
    const deal = await deals.get(result.dealId, writer);
    expect(deal.status).toBe('PENDING_CONTRACT');
    expect(deal.acceptedOffer.id).toBe(o2.id);
    expect(deal.licenses).toHaveLength(1);
    expect(deal.licenses[0]).toMatchObject({ licenseeId: producer.id, status: 'DRAFT' });
    expect(deal.licenses[0].scope).toContain('작가 60% / 제작자 40%');

    // 7. 대본 이용허락 계약: 양쪽이 서명해야 딜·라이선스가 ACTIVE
    const license = await contracts.forDeal(deal.id, writer);
    expect(license).toMatchObject({ kind: 'SCRIPT_LICENSE', status: 'AWAITING_SIGNATURES', awaitingMySignature: true });
    expect(license.body).toContain('작가 60% / 제작자 40%');
    expect(license.body).toContain('특약: 해외 판권 제외');
    const meta = { ip: '127.0.0.1', userAgent: 'vitest' };
    await expect(contracts.sign(license.id, writer, { signedName: '다른 이름', agreed: true }, meta)).rejects.toThrow(BadRequestException);
    await expect(contracts.sign(license.id, outsider, { signedName: 'outsider', agreed: true }, meta)).rejects.toThrow(NotFoundException);
    const half = await contracts.sign(license.id, writer, { signedName: 'writer', agreed: true }, meta);
    expect(half.status).toBe('AWAITING_SIGNATURES');
    await expect(contracts.sign(license.id, writer, { signedName: 'writer', agreed: true }, meta)).rejects.toThrow(ConflictException);
    expect((await deals.get(deal.id, writer)).status).toBe('PENDING_CONTRACT');
    const done = await contracts.sign(license.id, producer, { signedName: 'producer', agreed: true }, meta);
    expect(done.status).toBe('SIGNED');
    expect(done.bodySha256).toBe(license.bodySha256);
    const active = await deals.get(deal.id, writer);
    expect(active.status).toBe('ACTIVE');
    expect(active.licenses[0].status).toBe('ACTIVE');
    expect(active.licenses[0].endsAt!.getTime() - active.licenses[0].startsAt!.getTime()).toBeGreaterThan(700 * 86_400_000);
    expect((await prisma.contractParty.findFirstOrThrow({ where: { contractId: license.id, role: 'WRITER' } })).ip).toBe('127.0.0.1');
    expect((await deals.list(producer)).map((d) => d.id)).toContain(deal.id);
    expect((await deals.list(admin)).map((d) => d.id)).toContain(deal.id);
    expect((await deals.list(outsider)).map((d) => d.id)).not.toContain(deal.id);
    await expect(deals.get(deal.id, outsider)).rejects.toThrow(NotFoundException);

    // 8. 장부 (관리자 기록)
    await ledger.record(deal.id, admin, { type: 'REVENUE', amountKrw: 10_000_000, memo: '1차 매출' });
    await ledger.record(deal.id, admin, { type: 'PAYOUT', amountKrw: 6_000_000, occurredAt: '2026-10-01T00:00:00Z' });
    await expect(ledger.record(deal.id, admin, { type: 'FEE', amountKrw: -1 })).rejects.toThrow(BadRequestException);
    const book = await ledger.get(deal.id, producer);
    expect(book.entries.map((e) => e.type)).toEqual(['PAYOUT', 'REVENUE']);
    expect(book.totals.balance).toBe(4_000_000);
    await expect(ledger.get(deal.id, outsider)).rejects.toThrow(NotFoundException);
  });

  it('독점 수락 시 같은 대본의 다른 협상은 종료된다', async () => {
    const s = await scripts.create(writer, {
      title: '독점 테스트', logline: 'l', synopsis: 's', genre: '드라마', fullText: 'text', rightsDeclared: true,
    });
    await scripts.publish(s.id, writer, {});
    for (const p of [producer, producer2]) {
      const r = await access.request(s.id, p, { ndaAccepted: true });
      await access.approve(r.id, writer);
    }
    const n1 = await negotiations.start(s.id, producer);
    const n2 = await negotiations.start(s.id, producer2);
    const pending = await offers.create(n2.id, producer2, { writerSharePct: 70, producerSharePct: 30, upfrontFeeKrw: 0, termMonths: 12, exclusive: false });
    const winning = await offers.create(n1.id, producer, { writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 1_000_000, termMonths: 36, exclusive: true });
    await offers.accept(winning.id, writer);

    expect((await negotiations.get(n2.id, producer2)).status).toBe('CLOSED');
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('REJECTED');
    await expect(negotiations.postMessage(n2.id, producer2, { body: 'hi' })).rejects.toThrow(ConflictException);
  });

  it('제안 철회·거절 권한', async () => {
    const s = await scripts.create(writer, {
      title: '철회 테스트', logline: 'l', synopsis: 's', genre: '코미디', fullText: 'text', rightsDeclared: true,
    });
    await scripts.publish(s.id, writer, {});
    const r = await access.request(s.id, producer, { ndaAccepted: true });
    await access.approve(r.id, writer);
    const n = await negotiations.start(s.id, producer);
    const terms = { writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 0, termMonths: 6, exclusive: false };

    const a = await offers.create(n.id, producer, terms);
    await expect(offers.withdraw(a.id, writer)).rejects.toThrow(ForbiddenException);
    expect((await offers.withdraw(a.id, producer)).status).toBe('WITHDRAWN');

    const b = await offers.create(n.id, producer, terms);
    const c = await offers.create(n.id, producer, { ...terms, upfrontFeeKrw: 100 });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('WITHDRAWN');
    expect((await offers.reject(c.id, writer)).status).toBe('REJECTED');
    expect((await negotiations.get(n.id, writer)).status).toBe('OPEN');
  });

  it('숨김 대본은 다시 공개할 수 없고 승인된 제작자도 전문을 못 본다', async () => {
    const s = await scripts.create(writer, {
      title: '숨김 테스트', logline: 'l', synopsis: 's', genre: '공포', fullText: 'secret', rightsDeclared: true,
    });
    await scripts.publish(s.id, writer, {});
    const r = await access.request(s.id, producer, { ndaAccepted: true });
    await access.approve(r.id, writer);
    await prisma.script.update({ where: { id: s.id }, data: { status: 'HIDDEN' } });

    await expect(scripts.get(s.id, producer)).rejects.toThrow(NotFoundException);
    expect((await scripts.get(s.id, writer)).fullText).toBe('secret');
    await expect(scripts.publish(s.id, writer, {})).rejects.toThrow(ForbiddenException);
    await expect(scripts.update(s.id, writer, { rightsDeclared: false })).resolves.toBeDefined();
  });
  it('동시에 수락·결정해도 딜은 하나, 결정은 한 번만 반영된다', async () => {
    const s = await scripts.create(writer, {
      title: '동시성 테스트', logline: 'l', synopsis: 's', genre: '액션', fullText: 'text', rightsDeclared: true,
    });
    await scripts.publish(s.id, writer, {});
    const r = await access.request(s.id, producer, { ndaAccepted: true });
    const decisions = await Promise.allSettled([access.approve(r.id, writer), access.reject(r.id, writer)]);
    expect(decisions.filter((d) => d.status === 'fulfilled')).toHaveLength(1);
    if ((await prisma.scriptAccessRequest.findUniqueOrThrow({ where: { id: r.id } })).status !== 'APPROVED') {
      await prisma.scriptAccessRequest.update({ where: { id: r.id }, data: { status: 'APPROVED' } });
    }

    const n = await negotiations.start(s.id, producer);
    const o = await offers.create(n.id, producer, { writerSharePct: 50, producerSharePct: 50, upfrontFeeKrw: 0, termMonths: 6, exclusive: false });
    const results = await Promise.allSettled([offers.accept(o.id, writer), offers.accept(o.id, writer), offers.accept(o.id, writer)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.deal.count({ where: { negotiationId: n.id } })).toBe(1);
    expect(await prisma.license.count({ where: { deal: { negotiationId: n.id } } })).toBe(1);
  });
});
