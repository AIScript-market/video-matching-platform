import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  ActivityLogQueryDto,
  MessageLogPageDto,
  UploadLogPageDto,
  ViewLogPageDto,
} from './activity-log.dto.js';

const USER = { select: { id: true, displayName: true, email: true, roles: true } } as const;
const SCRIPT = { select: { id: true, title: true } } as const;

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });
const userMatches = (q: string) => ({ OR: [{ displayName: contains(q) }, { email: contains(q) }] });

/** 관리자용 활동 로그: 메시지, 전문 열람, 대본 업로드 (최신순) */
@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async messages(query: ActivityLogQueryDto): Promise<MessageLogPageDto> {
    const take = query.take ?? 50;
    const q = query.q?.trim();
    const rows = await this.prisma.message.findMany({
      where: q
        ? {
            OR: [
              { body: contains(q) },
              { sender: userMatches(q) },
              { negotiation: { script: { title: contains(q) } } },
              { negotiation: { writer: userMatches(q) } },
              { negotiation: { producer: userMatches(q) } },
            ],
          }
        : {},
      include: {
        sender: USER,
        negotiation: { include: { script: SCRIPT, writer: USER, producer: USER } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map((m) => {
      const n = m.negotiation;
      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        negotiationId: n.id,
        negotiationStatus: n.status,
        script: n.script,
        sender: m.sender,
        recipient: m.senderId === n.writerId ? n.producer : n.writer,
      };
    });
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  async views(query: ActivityLogQueryDto): Promise<ViewLogPageDto> {
    const take = query.take ?? 50;
    const q = query.q?.trim();
    const rows = await this.prisma.scriptAccessLog.findMany({
      where: q ? { OR: [{ script: { title: contains(q) } }, { user: userMatches(q) }] } : {},
      include: { script: SCRIPT, user: USER },
      orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map(({ scriptId: _s, userId: _u, ...r }) => r);
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  async uploads(query: ActivityLogQueryDto): Promise<UploadLogPageDto> {
    const take = query.take ?? 50;
    const q = query.q?.trim();
    const rows = await this.prisma.scriptUpload.findMany({
      where: q
        ? { OR: [{ filename: contains(q) }, { script: { title: contains(q) } }, { uploader: userMatches(q) }] }
        : {},
      include: { script: SCRIPT, uploader: USER },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map(({ scriptId: _s, uploaderId: _u, ...r }) => r);
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }
}
