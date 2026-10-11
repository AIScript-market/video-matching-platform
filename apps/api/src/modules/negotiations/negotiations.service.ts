import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import type {
  CreateMessageDto,
  MessageDto,
  NegotiationDetailDto,
  NegotiationDto,
} from './dto/negotiation.dto.js';

const LIST_INCLUDE = {
  script: { select: { id: true, title: true } },
  writer: { select: { id: true, displayName: true } },
  producer: { select: { id: true, displayName: true } },
  offers: { orderBy: { createdAt: 'desc' }, take: 1 },
  deal: { select: { id: true } },
} as const;

export const MESSAGE_PAGE = 100;

type NegotiationRow = { writerId: string; producerId: string };

export function isParticipant(n: NegotiationRow, user: Viewer) {
  return n.writerId === user.id || n.producerId === user.id;
}

@Injectable()
export class NegotiationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 제작자가 협상을 시작한다. 열람 승인(APPROVED)을 받은 공개 대본만 가능.
   * 같은 대본·제작자 조합의 협상이 이미 있으면 그것을 돌려준다.
   */
  async start(scriptId: string, producer: Viewer): Promise<NegotiationDetailDto> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      select: { authorId: true, status: true },
    });
    if (!script || script.status !== 'PUBLISHED') {
      throw new NotFoundException('공개된 대본을 찾을 수 없습니다');
    }
    if (script.authorId === producer.id) {
      throw new BadRequestException('자신의 대본과는 협상할 수 없습니다');
    }
    const access = await this.prisma.scriptAccessRequest.findUnique({
      where: { scriptId_producerId: { scriptId, producerId: producer.id } },
      select: { status: true },
    });
    if (access?.status !== 'APPROVED') {
      throw new ForbiddenException('전문 열람 승인을 받은 뒤에 협상을 시작할 수 있습니다');
    }
    const negotiation = await this.prisma.negotiation.upsert({
      where: { scriptId_producerId: { scriptId, producerId: producer.id } },
      update: {},
      create: { scriptId, writerId: script.authorId, producerId: producer.id, status: 'OPEN' },
    });
    return this.get(negotiation.id, producer);
  }

  async list(user: Viewer): Promise<NegotiationDto[]> {
    const rows = await this.prisma.negotiation.findMany({
      where: { OR: [{ writerId: user.id }, { producerId: user.id }] },
      include: LIST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map(({ offers, deal, ...n }) => ({
      ...n,
      latestOffer: offers[0] ?? null,
      dealId: deal?.id ?? null,
    })) as unknown as NegotiationDto[];
  }

  async get(id: string, user: Viewer): Promise<NegotiationDetailDto> {
    const n = await this.prisma.negotiation.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        offers: { orderBy: { createdAt: 'asc' as const } },
      },
    });
    if (!n || !(isParticipant(n, user) || user.roles.includes('ADMIN'))) {
      throw new NotFoundException('협상을 찾을 수 없습니다');
    }
    const { offers, deal, ...rest } = n;
    return {
      ...rest,
      offers,
      latestOffer: offers[offers.length - 1] ?? null,
      dealId: deal?.id ?? null,
    } as unknown as NegotiationDetailDto;
  }

  /** 참여자 확인 후 협상 행을 돌려준다. 참여자가 아니면 존재 자체를 숨긴다. */
  async findForParticipant(id: string, user: Viewer) {
    const n = await this.prisma.negotiation.findUnique({ where: { id } });
    if (!n || !isParticipant(n, user)) throw new NotFoundException('협상을 찾을 수 없습니다');
    return n;
  }

  /** after가 있으면 그 메시지 이후(폴링), 없으면 최근 100개. 항상 오래된 순. */
  async listMessages(id: string, user: Viewer, after?: string): Promise<MessageDto[]> {
    const n = await this.prisma.negotiation.findUnique({ where: { id } });
    if (!n || !(isParticipant(n, user) || user.roles.includes('ADMIN'))) {
      throw new NotFoundException('협상을 찾을 수 없습니다');
    }
    if (after) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: after, negotiationId: id },
        select: { id: true, createdAt: true },
      });
      if (!anchor) throw new BadRequestException('after에 해당하는 메시지가 없습니다');
      return this.prisma.message.findMany({
        where: {
          negotiationId: id,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { gt: anchor.id } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MESSAGE_PAGE,
      });
    }
    const latest = await this.prisma.message.findMany({
      where: { negotiationId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_PAGE,
    });
    return latest.reverse();
  }

  async postMessage(id: string, user: Viewer, dto: CreateMessageDto): Promise<MessageDto> {
    const n = await this.findForParticipant(id, user);
    if (n.status === 'CLOSED') throw new ConflictException('종료된 협상에는 메시지를 보낼 수 없습니다');
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('메시지 내용이 비어 있습니다');
    return this.prisma.message.create({ data: { negotiationId: id, senderId: user.id, body } });
  }
}
