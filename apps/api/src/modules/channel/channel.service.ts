import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { splitRevenue, validateSettlementMonth } from '../contracts/settlement-rules.js';
import { DealsService } from '../deals/deals.service.js';
import type {
  ChannelVideoDto,
  PublishVideoDto,
  RecordPayoutDto,
  RecordRevenueDto,
  ReviewVideoDto,
  RevenueLineDto,
  SettlementDto,
  SubmitVideoDto,
  VideoStatusName,
} from './channel.dto.js';

const VIDEO_INCLUDE = { deal: { select: { negotiation: { select: { script: { select: { title: true } } } } } } } as const;

type VideoRow = Prisma.ChannelVideoGetPayload<{ include: typeof VIDEO_INCLUDE }>;

function toVideo({ deal, reviewedById: _r, updatedAt: _u, ...v }: VideoRow): ChannelVideoDto {
  return { ...v, rightsChecklist: v.rightsChecklist as unknown as ChannelVideoDto['rightsChecklist'], scriptTitle: deal.negotiation.script.title };
}

/**
 * 영상 게시와 정산 (docs/business-model.md).
 * 제작자 제출 → 관리자 검수 → 관리자가 우리 장르 채널에 올리고 영상 번호 기록 → 끝난 달 확정 수익 입력 → 배분율대로 정산 → 지급 기록.
 */
@Injectable()
export class ChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
    private readonly contracts: ContractsService,
  ) {}

  // ---------- 제출 ----------

  async submit(dealId: string, user: Viewer, dto: SubmitVideoDto): Promise<ChannelVideoDto> {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, select: { status: true, negotiation: { select: { producerId: true, writerId: true } } } });
    if (!deal || (deal.negotiation.producerId !== user.id && deal.negotiation.writerId !== user.id)) {
      throw new NotFoundException('딜을 찾을 수 없습니다');
    }
    if (deal.negotiation.producerId !== user.id) throw new ForbiddenException('영상은 딜의 제작자만 제출할 수 있습니다');
    if (deal.status !== 'ACTIVE') {
      throw new ConflictException({ message: '대본 이용허락 계약에 양쪽이 서명한 뒤에 영상을 제출할 수 있습니다', error: 'DEAL_NOT_ACTIVE' });
    }
    if (!(await this.contracts.hasSignedChannelContract(user.id))) {
      throw new ConflictException({ message: '먼저 채널 게시 계약에 서명해 주세요', error: 'CHANNEL_CONTRACT_REQUIRED' });
    }
    const v = await this.prisma.channelVideo.create({
      data: {
        dealId,
        producerId: user.id,
        title: dto.title,
        description: dto.description?.trim() || null,
        sourceUrl: dto.sourceUrl,
        rightsChecklist: {
          musicCleared: dto.rights.musicCleared,
          materialsCleared: dto.rights.materialsCleared,
          performersConsented: dto.rights.performersConsented,
          adDisclosureChecked: dto.rights.adDisclosureChecked,
          containsPaidPromotion: dto.rights.containsPaidPromotion,
          sources: dto.rights.sources?.trim() || null,
        },
      },
      include: VIDEO_INCLUDE,
    });
    return toVideo(v);
  }

  async listForDeal(dealId: string, user: Viewer): Promise<ChannelVideoDto[]> {
    await this.deals.assertCanView(dealId, user);
    const rows = await this.prisma.channelVideo.findMany({ where: { dealId }, include: VIDEO_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(toVideo);
  }

  // ---------- 관리자: 검수·게시 ----------

  async adminList(status?: VideoStatusName): Promise<ChannelVideoDto[]> {
    const rows = await this.prisma.channelVideo.findMany({
      where: status ? { status } : {},
      include: VIDEO_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map(toVideo);
  }

  async review(id: string, admin: Viewer, dto: ReviewVideoDto): Promise<ChannelVideoDto> {
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) throw new BadRequestException('거절하면 이유를 적어 주세요');
    return this.transition(id, ['SUBMITTED'], {
      status: dto.decision,
      reviewNote: dto.note?.trim() || null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    });
  }

  async publish(id: string, dto: PublishVideoDto): Promise<ChannelVideoDto> {
    try {
      return await this.transition(id, ['APPROVED'], {
        status: 'PUBLISHED',
        channelName: dto.channelName,
        youtubeVideoId: dto.youtubeVideoId,
        publishedAt: new Date(),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 다른 영상에 기록된 YouTube 영상 번호입니다');
      }
      throw e;
    }
  }

  async remove(id: string, note: string): Promise<ChannelVideoDto> {
    return this.transition(id, ['APPROVED', 'PUBLISHED'], { status: 'REMOVED', reviewNote: note.trim() });
  }

  private async transition(id: string, from: VideoStatusName[], data: Prisma.ChannelVideoUncheckedUpdateManyInput): Promise<ChannelVideoDto> {
    const { count } = await this.prisma.channelVideo.updateMany({ where: { id, status: { in: from } }, data });
    if (count === 0) {
      const exists = await this.prisma.channelVideo.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw new NotFoundException('영상을 찾을 수 없습니다');
      throw new ConflictException(`지금 상태(${exists.status})에서는 할 수 없습니다`);
    }
    return toVideo(await this.prisma.channelVideo.findUniqueOrThrow({ where: { id }, include: VIDEO_INCLUDE }));
  }

  // ---------- 정산 ----------

  /** 관리자: 끝난 달의 YouTube 확정 수익을 영상마다 기록한다 (게시했거나 게시 후 내린 영상만) */
  async recordRevenue(videoId: string, admin: Viewer, dto: RecordRevenueDto): Promise<RevenueLineDto> {
    validateSettlementMonth(dto.month);
    const video = await this.prisma.channelVideo.findUnique({ where: { id: videoId }, select: { status: true, publishedAt: true, dealId: true } });
    if (!video) throw new NotFoundException('영상을 찾을 수 없습니다');
    if (!video.publishedAt) throw new ConflictException('게시한 적 없는 영상에는 수익을 기록할 수 없습니다');
    try {
      const r = await this.prisma.videoRevenue.create({
        data: { videoId, month: dto.month, amountKrw: dto.amountKrw, memo: dto.memo?.trim() || null, createdById: admin.id },
      });
      return (await this.settlement(video.dealId, admin)).lines.find((l) => l.id === r.id)!;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`${dto.month} 수익은 이미 기록했습니다`);
      }
      throw e;
    }
  }

  /** 딜의 정산서: 영상·월별 확정 수익, 배분율로 나눈 몫(플랫폼 0), 지급 기록 */
  async settlement(dealId: string, user: Viewer): Promise<SettlementDto> {
    await this.deals.assertCanView(dealId, user);
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { acceptedOfferId: true } });
    const offer = await this.prisma.offer.findUniqueOrThrow({ where: { id: deal.acceptedOfferId }, select: { writerSharePct: true, producerSharePct: true } });
    const revenues = await this.prisma.videoRevenue.findMany({
      where: { video: { dealId } },
      include: { video: { select: { title: true } }, payouts: { orderBy: { paidAt: 'asc' } } },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
    });
    const lines: RevenueLineDto[] = revenues.map((r) => {
      const split = splitRevenue(r.amountKrw, offer.writerSharePct);
      return {
        id: r.id,
        videoId: r.videoId,
        videoTitle: r.video.title,
        month: r.month,
        amountKrw: r.amountKrw,
        writerKrw: split.writerKrw,
        producerKrw: split.producerKrw,
        platformKrw: split.platformKrw,
        payouts: r.payouts.map(({ id, role, amountKrw, paidAt, memo }) => ({ id, role: role as 'WRITER' | 'PRODUCER', amountKrw, paidAt, memo })),
      };
    });
    const sum = (f: (l: RevenueLineDto) => number) => lines.reduce((a, l) => a + f(l), 0);
    const paid = (role: string) => sum((l) => l.payouts.filter((p) => p.role === role).reduce((a, p) => a + p.amountKrw, 0));
    return {
      dealId,
      writerSharePct: offer.writerSharePct,
      producerSharePct: offer.producerSharePct,
      lines,
      totalRevenueKrw: sum((l) => l.amountKrw),
      writerDueKrw: sum((l) => l.writerKrw),
      producerDueKrw: sum((l) => l.producerKrw),
      writerPaidKrw: paid('WRITER'),
      producerPaidKrw: paid('PRODUCER'),
    };
  }

  /** 관리자: 플랫폼 밖에서 이체한 뒤 지급을 기록한다. 금액은 정산 규칙으로 정해져 있어 입력받지 않는다 */
  async recordPayout(revenueId: string, admin: Viewer, dto: RecordPayoutDto): Promise<SettlementDto> {
    const r = await this.prisma.videoRevenue.findUnique({
      where: { id: revenueId },
      select: {
        amountKrw: true,
        video: { select: { dealId: true, deal: { select: { acceptedOfferId: true, negotiation: { select: { writerId: true, producerId: true } } } } } },
      },
    });
    if (!r) throw new NotFoundException('수익 기록을 찾을 수 없습니다');
    const offer = await this.prisma.offer.findUniqueOrThrow({ where: { id: r.video.deal.acceptedOfferId }, select: { writerSharePct: true } });
    const split = splitRevenue(r.amountKrw, offer.writerSharePct);
    const amountKrw = dto.role === 'WRITER' ? split.writerKrw : split.producerKrw;
    const recipientId = dto.role === 'WRITER' ? r.video.deal.negotiation.writerId : r.video.deal.negotiation.producerId;
    try {
      await this.prisma.settlementPayout.create({
        data: {
          revenueId,
          role: dto.role,
          recipientId,
          amountKrw,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          memo: dto.memo?.trim() || null,
          createdById: admin.id,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('이미 지급을 기록했습니다');
      throw e;
    }
    return this.settlement(r.video.dealId, admin);
  }
}
