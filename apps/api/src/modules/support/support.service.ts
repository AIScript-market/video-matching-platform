import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import {
  PRIVATE_TITLE,
  type CreateInquiryDto,
  type CreateInquiryReplyDto,
  type InquiryDetailDto,
  type InquiryPageDto,
  type InquirySummaryDto,
  type ListInquiriesQueryDto,
} from './support.dto.js';

const STAFF_NAME = '운영자';

const SUMMARY_SELECT = {
  id: true,
  authorId: true,
  category: true,
  title: true,
  isPrivate: true,
  status: true,
  hiddenAt: true,
  createdAt: true,
  lastActivityAt: true,
  author: { select: { displayName: true } },
  _count: { select: { replies: true } },
} as const;

type SummaryRow = Prisma.InquiryGetPayload<{ select: typeof SUMMARY_SELECT }>;

const isAdmin = (viewer: Viewer | null) => Boolean(viewer?.roles.includes('ADMIN'));

/** 이 사람이 문의 내용을 볼 수 있는가: 공개 문의는 누구나, 비밀 문의는 작성자와 운영자. 숨긴 문의는 운영자만 */
function canRead(row: { authorId: string; isPrivate: boolean; hiddenAt: Date | null }, viewer: Viewer | null): boolean {
  if (isAdmin(viewer)) return true;
  if (row.hiddenAt) return false;
  return !row.isPrivate || row.authorId === viewer?.id;
}

function toSummary(row: SummaryRow, viewer: Viewer | null): InquirySummaryDto {
  const readable = canRead(row, viewer);
  return {
    id: row.id,
    category: row.category,
    title: readable ? row.title : PRIVATE_TITLE,
    isPrivate: row.isPrivate,
    status: row.status,
    authorName: readable ? row.author.displayName : null,
    mine: row.authorId === viewer?.id,
    replyCount: row._count.replies,
    hidden: row.hiddenAt !== null,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
  };
}

/**
 * 문의 게시판 (도움말 > 문의하기). 메일 대신 게시판으로 받는다.
 * 비밀 문의가 기본이고, 비밀 문의는 다른 사람에게 제목·작성자도 가린다. 운영자 답변은 "운영자" 이름으로 보인다.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewer: Viewer | null, query: ListInquiriesQueryDto): Promise<InquiryPageDto> {
    if (query.mine && !viewer) throw new ForbiddenException('로그인이 필요합니다');
    const take = query.take ?? 20;
    const where: Prisma.InquiryWhereInput = {
      ...(isAdmin(viewer) ? {} : { hiddenAt: null }),
      ...(query.mine && { authorId: viewer!.id }),
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
    };
    // 운영자가 답변 대기 문의를 볼 때는 오래 기다린 것부터
    const dir = isAdmin(viewer) && query.status === 'OPEN' ? 'asc' : 'desc';
    const rows = await this.prisma.inquiry.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ lastActivityAt: dir }, { id: dir }],
      take: take + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const items = rows.slice(0, take).map((r) => toSummary(r, viewer));
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  async get(id: string, viewer: Viewer | null): Promise<InquiryDetailDto> {
    const row = await this.prisma.inquiry.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        body: true,
        replies: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, fromStaff: true, body: true, createdAt: true, author: { select: { displayName: true } } },
        },
      },
    });
    // 볼 수 없는 문의는 있는지도 알리지 않는다
    if (!row || !canRead(row, viewer)) throw new NotFoundException('문의를 찾을 수 없습니다');
    const participant = isAdmin(viewer) || row.authorId === viewer?.id;
    return {
      ...toSummary(row, viewer),
      body: row.body,
      replies: row.replies.map((r) => ({
        id: r.id,
        fromStaff: r.fromStaff,
        authorName: r.fromStaff ? STAFF_NAME : r.author.displayName,
        body: r.body,
        createdAt: r.createdAt,
      })),
      canReply: participant,
      canClose: participant && row.status !== 'CLOSED',
    };
  }

  async create(user: Viewer, dto: CreateInquiryDto): Promise<InquiryDetailDto> {
    const row = await this.prisma.inquiry.create({
      data: { authorId: user.id, category: dto.category, title: dto.title, body: dto.body, isPrivate: dto.isPrivate ?? true },
      select: { id: true },
    });
    return this.get(row.id, user);
  }

  /** 답글: 운영자가 달면 답변 완료, 작성자가 더 물으면(닫힌 문의도) 다시 답변 대기 */
  async reply(id: string, user: Viewer, dto: CreateInquiryReplyDto): Promise<InquiryDetailDto> {
    const row = await this.findParticipating(id, user);
    const staff = isAdmin(user) && row.authorId !== user.id;
    await this.prisma.$transaction([
      this.prisma.inquiryReply.create({ data: { inquiryId: id, authorId: user.id, fromStaff: staff, body: dto.body } }),
      this.prisma.inquiry.update({ where: { id }, data: { status: staff ? 'ANSWERED' : 'OPEN', lastActivityAt: new Date() } }),
    ]);
    return this.get(id, user);
  }

  async close(id: string, user: Viewer): Promise<InquiryDetailDto> {
    await this.findParticipating(id, user);
    await this.prisma.inquiry.update({ where: { id }, data: { status: 'CLOSED' } });
    return this.get(id, user);
  }

  /** 운영자: 스팸·부적절한 문의를 숨기거나 다시 보인다 */
  async hide(id: string, hidden: boolean): Promise<InquirySummaryDto> {
    const exists = await this.prisma.inquiry.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('문의를 찾을 수 없습니다');
    const row = await this.prisma.inquiry.update({ where: { id }, data: { hiddenAt: hidden ? new Date() : null }, select: SUMMARY_SELECT });
    return toSummary(row, { id: 'admin', roles: ['ADMIN'] });
  }

  /** 작성자 또는 운영자만 (볼 수 없으면 404, 볼 수는 있지만 참여자가 아니면 403) */
  private async findParticipating(id: string, user: Viewer) {
    const row = await this.prisma.inquiry.findUnique({ where: { id }, select: { authorId: true, isPrivate: true, hiddenAt: true } });
    if (!row || !canRead(row, user)) throw new NotFoundException('문의를 찾을 수 없습니다');
    if (row.authorId !== user.id && !isAdmin(user)) throw new ForbiddenException('작성자와 운영자만 답글을 달 수 있습니다');
    return row;
  }
}
