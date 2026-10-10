import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Viewer } from '../access/access-rules';
import type { DealDto } from './dto/deal.dto';

const INCLUDE = {
  negotiation: {
    include: {
      script: { select: { id: true, title: true } },
      writer: { select: { id: true, displayName: true } },
      producer: { select: { id: true, displayName: true } },
    },
  },
  licenses: { orderBy: { id: 'asc' } },
} as const;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 관리자는 전체, 그 외에는 내가 작가·제작자로 참여한 딜 */
  async list(user: Viewer): Promise<DealDto[]> {
    const isAdmin = user.roles.includes('ADMIN');
    const deals = await this.prisma.deal.findMany({
      where: isAdmin
        ? {}
        : { negotiation: { OR: [{ writerId: user.id }, { producerId: user.id }] } },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return this.withOffers(deals);
  }

  async get(id: string, user: Viewer): Promise<DealDto> {
    await this.assertCanView(id, user);
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return (await this.withOffers([deal]))[0];
  }

  /** 참여자(작가·제작자) 또는 관리자만 딜을 볼 수 있다. 아니면 404로 존재를 숨긴다. */
  async assertCanView(id: string, user: Viewer): Promise<void> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      select: { negotiation: { select: { writerId: true, producerId: true } } },
    });
    const ok =
      deal &&
      (user.roles.includes('ADMIN') ||
        deal.negotiation.writerId === user.id ||
        deal.negotiation.producerId === user.id);
    if (!ok) throw new NotFoundException('딜을 찾을 수 없습니다');
  }

  private async withOffers(
    deals: Array<{
      acceptedOfferId: string;
      negotiation: { script: unknown; writer: unknown; producer: unknown };
      [k: string]: unknown;
    }>,
  ): Promise<DealDto[]> {
    const offers = await this.prisma.offer.findMany({
      where: { id: { in: deals.map((d) => d.acceptedOfferId) } },
    });
    const byId = new Map(offers.map((o) => [o.id, o]));
    return deals.map(({ negotiation, ...d }) => ({
      ...d,
      script: negotiation.script,
      writer: negotiation.writer,
      producer: negotiation.producer,
      acceptedOffer: byId.get(d.acceptedOfferId),
    })) as unknown as DealDto[];
  }
}
