import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BackofficeService } from '../backoffice/backoffice.service.js';
import type {
  AdminReportDto,
  AdminReportPageDto,
  CreateReportDto,
  ListReportsQueryDto,
  ReportedUserDto,
  ReportReasonValue,
  ReportReceiptDto,
  ResolveReportDto,
} from './reports.dto.js';

const USER = { select: { id: true, displayName: true, email: true, status: true } } as const;
const INCLUDE = {
  reporter: USER,
  target: USER,
  resolvedBy: USER,
  script: { select: { id: true, title: true } },
} as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backoffice: BackofficeService,
  ) {}

  /**
   * 계정 신고. 자기 자신·관리자·탈퇴한 계정은 신고할 수 없고,
   * 같은 사람이 같은 계정을 처리 전 상태로 두 번 신고할 수 없다.
   */
  async create(reporter: AuthUser, targetId: string, dto: CreateReportDto): Promise<ReportReceiptDto> {
    if (targetId === reporter.id) throw new BadRequestException('자기 자신은 신고할 수 없습니다');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { roles: true, status: true } });
    if (!target || target.status === 'WITHDRAWN') throw new NotFoundException('신고할 계정을 찾을 수 없습니다');
    if (target.roles.includes('ADMIN')) throw new BadRequestException('관리자 계정은 신고할 수 없습니다');

    const details = dto.details?.trim() || null;
    if (dto.reason === 'OTHER' && !details) throw new BadRequestException('기타 사유는 내용을 적어 주세요');

    if (dto.scriptId) {
      const script = await this.prisma.script.findUnique({ where: { id: dto.scriptId }, select: { authorId: true } });
      if (!script) throw new BadRequestException('신고 위치의 대본을 찾을 수 없습니다');
    }

    const open = await this.prisma.accountReport.findFirst({
      where: { reporterId: reporter.id, targetId, status: 'OPEN' },
      select: { id: true },
    });
    if (open) throw new ConflictException('이 계정에 대한 신고가 이미 접수되어 처리를 기다리고 있습니다');

    return this.prisma.accountReport.create({
      data: { reporterId: reporter.id, targetId, reason: dto.reason, details, scriptId: dto.scriptId ?? null },
      select: { id: true, reason: true, status: true, createdAt: true },
    });
  }

  /** 관리자: 신고 목록 (최신순) */
  async list(query: ListReportsQueryDto): Promise<AdminReportPageDto> {
    const take = query.take ?? 50;
    const rows = await this.prisma.accountReport.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
      },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows
      .slice(0, take)
      .map(({ reporterId: _r, targetId: _t, scriptId: _s, resolvedById: _b, ...r }) => r) as AdminReportDto[];
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  /**
   * 관리자: 신고된 계정 모아 보기. 처리 전 신고가 있는 계정만,
   * 처리 전 신고 수(같으면 신고한 사람 수, 최근 신고) 순서로.
   */
  async reportedUsers(): Promise<ReportedUserDto[]> {
    const open = await this.prisma.accountReport.findMany({
      where: { status: 'OPEN' },
      select: { targetId: true, reporterId: true, reason: true, createdAt: true },
    });
    if (open.length === 0) return [];
    const byTarget = new Map<string, typeof open>();
    for (const r of open) byTarget.set(r.targetId, [...(byTarget.get(r.targetId) ?? []), r]);

    const targetIds = [...byTarget.keys()];
    const [users, totals] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: targetIds } }, select: USER.select }),
      this.prisma.accountReport.groupBy({ by: ['targetId'], where: { targetId: { in: targetIds } }, _count: { _all: true } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const totalById = new Map(totals.map((t) => [t.targetId, t._count._all]));

    return targetIds
      .map((id) => {
        const reports = byTarget.get(id)!;
        const reasonCounts = new Map<ReportReasonValue, number>();
        for (const r of reports) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
        return {
          user: userById.get(id)!,
          openCount: reports.length,
          totalCount: totalById.get(id) ?? reports.length,
          openReporters: new Set(reports.map((r) => r.reporterId)).size,
          reasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason),
          lastReportedAt: reports.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), reports[0].createdAt),
        };
      })
      .sort(
        (a, b) =>
          b.openCount - a.openCount ||
          b.openReporters - a.openReporters ||
          b.lastReportedAt.getTime() - a.lastReportedAt.getTime(),
      );
  }

  /** 관리자: 신고 처리. suspend=true면 신고된 계정을 정지하고 처리한다 */
  async resolve(admin: AuthUser, id: string, dto: ResolveReportDto): Promise<AdminReportDto> {
    const report = await this.prisma.accountReport.findUnique({ where: { id }, select: { status: true, targetId: true, reason: true } });
    if (!report) throw new NotFoundException('신고를 찾을 수 없습니다');
    if (report.status !== 'OPEN') throw new ConflictException('이미 처리된 신고입니다');
    if (dto.suspend && dto.status !== 'RESOLVED') throw new BadRequestException('정지는 "조치함"으로 처리할 때만 할 수 있습니다');

    const note = dto.note?.trim() || null;
    if (dto.suspend) {
      // 관리자 정지와 같은 규칙(관리자·탈퇴 계정 불가)을 따른다. 사유는 처리 메모를 쓴다
      await this.backoffice.setStatus(admin, report.targetId, { status: 'SUSPENDED', reason: note ?? `신고 처리 (${report.reason})` });
    }
    const { count } = await this.prisma.accountReport.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: dto.status, resolvedAt: new Date(), resolvedById: admin.id, resolutionNote: note },
    });
    if (count === 0) throw new ConflictException('이미 처리된 신고입니다');
    const { reporterId: _r, targetId: _t, scriptId: _s, resolvedById: _b, ...row } = await this.prisma.accountReport.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    });
    return row as AdminReportDto;
  }
}
