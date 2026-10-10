import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Viewer } from '../access/access-rules';
import type { AcceptOfferResultDto, CreateOfferDto, OfferDto } from './dto/negotiation.dto';
import { isParticipant, NegotiationsService } from './negotiations.service';
import {
  assertCanRespond,
  assertCanWithdraw,
  buildLicenseScope,
  supersededStatus,
  validateOfferTerms,
} from './offer-rules';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negotiations: NegotiationsService,
  ) {}

  /** 새 제안. 기존 PROPOSED 제안은 역제안(COUNTERED) 또는 대체(WITHDRAWN) 처리된다. */
  async create(negotiationId: string, user: Viewer, dto: CreateOfferDto): Promise<OfferDto> {
    validateOfferTerms(dto);
    const n = await this.negotiations.findForParticipant(negotiationId, user);
    if (n.status !== 'OPEN') throw new ConflictException('진행 중인 협상에서만 제안할 수 있습니다');

    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.offer.findMany({ where: { negotiationId, status: 'PROPOSED' } });
      for (const prev of pending) {
        await tx.offer.updateMany({
          where: { id: prev.id, status: 'PROPOSED' },
          data: { status: supersededStatus(prev, user.id) },
        });
      }
      return tx.offer.create({
        data: {
          negotiationId,
          proposerId: user.id,
          writerSharePct: dto.writerSharePct,
          producerSharePct: dto.producerSharePct,
          upfrontFeeKrw: dto.upfrontFeeKrw,
          termMonths: dto.termMonths,
          exclusive: dto.exclusive,
          notes: dto.notes?.trim() || null,
          status: 'PROPOSED',
        },
      });
    }) as Promise<OfferDto>;
  }

  /**
   * 수락 = 매칭. 한 트랜잭션에서
   * 제안 ACCEPTED → 협상 AGREED → Deal(PENDING_CONTRACT) + License(DRAFT) 생성.
   * 독점 조건이면 같은 대본의 다른 진행 중 협상을 종료한다.
   */
  async accept(offerId: string, user: Viewer): Promise<AcceptOfferResultDto> {
    const offer = await this.loadForParticipant(offerId, user);
    assertCanRespond(offer, user.id);
    if (offer.negotiation.status !== 'OPEN') {
      throw new ConflictException('진행 중인 협상이 아닙니다');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.offer.updateMany({
        where: { id: offerId, status: 'PROPOSED' },
        data: { status: 'ACCEPTED' },
      });
      const negotiation = await tx.negotiation.updateMany({
        where: { id: offer.negotiationId, status: 'OPEN' },
        data: { status: 'AGREED' },
      });
      if (updated.count === 0 || negotiation.count === 0) {
        throw new ConflictException('이미 처리된 제안입니다');
      }
      const deal = await tx.deal.create({
        data: {
          negotiationId: offer.negotiationId,
          acceptedOfferId: offerId,
          status: 'PENDING_CONTRACT',
        },
      });
      await tx.license.create({
        data: {
          dealId: deal.id,
          scriptId: offer.negotiation.scriptId,
          licenseeId: offer.negotiation.producerId,
          scope: buildLicenseScope(offer),
          status: 'DRAFT',
        },
      });
      if (offer.exclusive) {
        const others = await tx.negotiation.findMany({
          where: { scriptId: offer.negotiation.scriptId, status: 'OPEN', id: { not: offer.negotiationId } },
          select: { id: true },
        });
        const ids = others.map((o) => o.id);
        if (ids.length) {
          await tx.offer.updateMany({
            where: { negotiationId: { in: ids }, status: 'PROPOSED' },
            data: { status: 'REJECTED' },
          });
          await tx.negotiation.updateMany({ where: { id: { in: ids } }, data: { status: 'CLOSED' } });
        }
      }
      const accepted = await tx.offer.findUniqueOrThrow({ where: { id: offerId } });
      return { offer: accepted, dealId: deal.id };
    }) as Promise<AcceptOfferResultDto>;
  }

  async reject(offerId: string, user: Viewer): Promise<OfferDto> {
    const offer = await this.loadForParticipant(offerId, user);
    assertCanRespond(offer, user.id);
    return this.transition(offerId, 'REJECTED');
  }

  async withdraw(offerId: string, user: Viewer): Promise<OfferDto> {
    const offer = await this.loadForParticipant(offerId, user);
    assertCanWithdraw(offer, user.id);
    return this.transition(offerId, 'WITHDRAWN');
  }

  private async transition(offerId: string, status: 'REJECTED' | 'WITHDRAWN'): Promise<OfferDto> {
    const { count } = await this.prisma.offer.updateMany({
      where: { id: offerId, status: 'PROPOSED' },
      data: { status },
    });
    if (count === 0) throw new ConflictException('이미 처리된 제안입니다');
    return this.prisma.offer.findUniqueOrThrow({ where: { id: offerId } }) as Promise<OfferDto>;
  }

  private async loadForParticipant(offerId: string, user: Viewer) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { negotiation: true },
    });
    if (!offer || !isParticipant(offer.negotiation, user)) {
      throw new NotFoundException('제안을 찾을 수 없습니다');
    }
    return offer;
  }
}
