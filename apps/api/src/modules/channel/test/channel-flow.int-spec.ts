/**
 * 계약 → 채널 게시 → 정산 흐름 통합 테스트 (실제 PostgreSQL 필요, DATABASE_URL 없으면 건너뛴다).
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AccessService } from '../../access/access.service.js';
import type { Viewer } from '../../access/access-rules.js';
import { ContractsService } from '../../contracts/contracts.service.js';
import { DealsService } from '../../deals/deals.service.js';
import { NegotiationsService } from '../../negotiations/negotiations.service.js';
import { OffersService } from '../../negotiations/offers.service.js';
import { AiJobsQueue } from '../../scripts/ai-jobs.queue.js';
import { ScriptsService } from '../../scripts/scripts.service.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { ChannelService } from '../channel.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;
const meta = { ip: '127.0.0.1', userAgent: 'vitest' };
const rights = { musicCleared: true, materialsCleared: true, performersConsented: true, adDisclosureChecked: true, containsPaidPromotion: false };

run('채널 게시·정산 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let channel: ChannelService;
  let contracts: ContractsService;
  let writer: Viewer, producer: Viewer, admin: Viewer, outsider: Viewer;
  let dealId: string;
  const userIds: string[] = [];

  async function makeUser(name: string, roles: Array<'ADMIN'> = []): Promise<Viewer> {
    const u = await prisma.user.create({
      data: { email: `ch-${name}-${suffix}@test.local`, passwordHash: 'x', displayName: name, roles, coinBalance: 100, bio: '소개', profilePublic: true },
    });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    const wallet = new WalletService(prisma);
    const scripts = new ScriptsService(prisma, { enqueueSummarize: async () => true } as unknown as AiJobsQueue, wallet);
    contracts = new ContractsService(prisma);
    const access = new AccessService(prisma, contracts);
    const negotiations = new NegotiationsService(prisma, wallet);
    const offers = new OffersService(prisma, negotiations, contracts);
    const deals = new DealsService(prisma);
    channel = new ChannelService(prisma, deals, contracts);
    writer = await makeUser('writer');
    producer = await makeUser('producer');
    admin = await makeUser('admin', ['ADMIN']);
    outsider = await makeUser('outsider');

    const s = await scripts.create(writer, { title: '채널 테스트', logline: 'l', synopsis: 's', genre: '스릴러', fullText: 'text', rightsDeclared: true });
    await scripts.publish(s.id, writer, {});
    const r = await access.request(s.id, producer, { ndaAccepted: true }, meta);
    await access.approve(r.id, writer);
    const n = await negotiations.start(s.id, producer);
    const o = await offers.create(n.id, producer, { writerSharePct: 30, producerSharePct: 70, upfrontFeeKrw: 500_000, termMonths: 12, exclusive: false });
    dealId = (await offers.accept(o.id, writer)).dealId;
  });

  afterAll(async () => {
    const videoIds = (await prisma.channelVideo.findMany({ where: { producerId: { in: userIds } }, select: { id: true } })).map((v) => v.id);
    await prisma.settlementPayout.deleteMany({ where: { revenue: { videoId: { in: videoIds } } } });
    await prisma.videoRevenue.deleteMany({ where: { videoId: { in: videoIds } } });
    await prisma.channelVideo.deleteMany({ where: { id: { in: videoIds } } });
    await prisma.contract.deleteMany({ where: { parties: { some: { userId: { in: userIds } } } } });
    const scriptIds = (await prisma.script.findMany({ where: { authorId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
    const negIds = (await prisma.negotiation.findMany({ where: { scriptId: { in: scriptIds } }, select: { id: true } })).map((n) => n.id);
    await prisma.license.deleteMany({ where: { dealId } });
    await prisma.deal.deleteMany({ where: { negotiationId: { in: negIds } } });
    await prisma.offer.deleteMany({ where: { negotiationId: { in: negIds } } });
    await prisma.message.deleteMany({ where: { negotiationId: { in: negIds } } });
    await prisma.negotiation.deleteMany({ where: { id: { in: negIds } } });
    await prisma.scriptAccessLog.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.scriptAccessRequest.deleteMany({ where: { scriptId: { in: scriptIds } } });
    await prisma.script.deleteMany({ where: { id: { in: scriptIds } } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('계약 서명 전에는 제출 불가, 채널 계약 서명 뒤 제출 → 검수 → 게시 → 수익 → 정산 → 지급', async () => {
    const submit = { title: '1화', sourceUrl: 'https://drive.example.com/v/1', rights };
    // 대본 이용허락 계약 서명 전
    await expect(channel.submit(dealId, producer, submit)).rejects.toMatchObject({ response: { error: 'DEAL_NOT_ACTIVE' } });
    const license = await contracts.forDeal(dealId, producer);
    await contracts.sign(license.id, writer, { signedName: 'writer', agreed: true }, meta);
    await contracts.sign(license.id, producer, { signedName: 'producer', agreed: true }, meta);

    // 채널 게시 계약: 플랫폼은 이미 서명, 제작자 서명 전에는 제출 불가
    await expect(channel.submit(dealId, producer, submit)).rejects.toMatchObject({ response: { error: 'CHANNEL_CONTRACT_REQUIRED' } });
    const cc = await contracts.channelContract(producer);
    expect(cc.kind).toBe('CHANNEL_PUBLISHING');
    expect(cc.parties.find((p) => p.role === 'PLATFORM')?.signedAt).not.toBeNull();
    expect((await contracts.channelContract(producer)).id).toBe(cc.id); // 같은 버전은 하나
    await contracts.sign(cc.id, producer, { signedName: 'producer', agreed: true }, meta);

    await expect(channel.submit(dealId, writer, submit)).rejects.toThrow(ForbiddenException);
    await expect(channel.submit(dealId, outsider, submit)).rejects.toThrow(NotFoundException);
    const v = await channel.submit(dealId, producer, submit);
    expect(v).toMatchObject({ status: 'SUBMITTED', scriptTitle: '채널 테스트' });
    await expect(channel.listForDeal(dealId, outsider)).rejects.toThrow(NotFoundException);
    expect((await channel.listForDeal(dealId, writer)).map((x) => x.id)).toEqual([v.id]);

    // 검수: 승인 전에는 게시 불가, 수익 기록 불가
    await expect(channel.publish(v.id, { channelName: '스릴러 채널', youtubeVideoId: 'abcdefghijk' })).rejects.toThrow(ConflictException);
    await expect(channel.recordRevenue(v.id, admin, { month: '2020-01', amountKrw: 1 })).rejects.toThrow(ConflictException);
    await expect(channel.review(v.id, admin, { decision: 'REJECTED' })).rejects.toThrow(BadRequestException);
    expect((await channel.review(v.id, admin, { decision: 'APPROVED' })).status).toBe('APPROVED');
    const pub = await channel.publish(v.id, { channelName: '스릴러 채널', youtubeVideoId: `t${suffix}`.padEnd(11, 'x').slice(0, 11) });
    expect(pub.status).toBe('PUBLISHED');

    // 수익: 끝난 달만, 같은 달 두 번 불가. 작가 30% 내림, 나머지 제작자, 플랫폼 0
    await expect(channel.recordRevenue(v.id, admin, { month: '2999-01', amountKrw: 1 })).rejects.toThrow(BadRequestException);
    const line = await channel.recordRevenue(v.id, admin, { month: '2026-09', amountKrw: 10_001 });
    expect(line).toMatchObject({ amountKrw: 10_001, writerKrw: 3_000, producerKrw: 7_001, platformKrw: 0 });
    await expect(channel.recordRevenue(v.id, admin, { month: '2026-09', amountKrw: 5 })).rejects.toThrow(ConflictException);

    const s1 = await channel.settlement(dealId, writer);
    expect(s1).toMatchObject({ totalRevenueKrw: 10_001, writerDueKrw: 3_000, producerDueKrw: 7_001, writerPaidKrw: 0 });
    await expect(channel.settlement(dealId, outsider)).rejects.toThrow(NotFoundException);

    const s2 = await channel.recordPayout(line.id, admin, { role: 'WRITER', memo: '계좌 이체' });
    expect(s2.writerPaidKrw).toBe(3_000);
    await expect(channel.recordPayout(line.id, admin, { role: 'WRITER' })).rejects.toThrow(ConflictException);
    const payout = await prisma.settlementPayout.findFirstOrThrow({ where: { revenueId: line.id } });
    expect(payout.recipientId).toBe(writer.id);

    // 게시 중단: 지난 수익과 정산은 그대로
    expect((await channel.remove(v.id, '권리 신고')).status).toBe('REMOVED');
    expect((await channel.settlement(dealId, producer)).totalRevenueKrw).toBe(10_001);
  });
});
