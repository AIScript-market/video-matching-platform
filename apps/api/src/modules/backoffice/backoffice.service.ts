import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AdminScriptDto, AdminUserDto, ListUsersQueryDto, SetUserStatusDto } from './backoffice.dto.js';

const SCRIPT_SELECT = {
  id: true,
  title: true,
  genre: true,
  status: true,
  rightsDeclared: true,
  authorId: true,
  createdAt: true,
  author: { select: { displayName: true } },
} as const;

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  roles: true,
  status: true,
  suspendedAt: true,
  suspendReason: true,
  profilePublic: true,
  emailPublic: true,
  coinBalance: true,
  createdAt: true,
  _count: { select: { scripts: true } },
} as const;

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

@Injectable()
export class BackofficeService {
  constructor(private readonly prisma: PrismaService) {}

  async users(query: ListUsersQueryDto = {}): Promise<AdminUserDto[]> {
    const q = query.q?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(q ? { OR: [{ displayName: contains(q) }, { email: contains(q) }] } : {}),
      },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const reports = await this.prisma.accountReport.groupBy({
      by: ['targetId'],
      where: { targetId: { in: users.map((u) => u.id) }, status: 'OPEN' },
      _count: { _all: true },
    });
    const openReports = new Map(reports.map((r) => [r.targetId, r._count._all]));
    return users.map(({ _count, ...u }) => ({ ...u, scriptCount: _count.scripts, openReportCount: openReports.get(u.id) ?? 0 }));
  }

  /**
   * 일반 계정 정지·해제. 관리자 계정과 자기 자신, 탈퇴한 계정은 대상이 아니다.
   * 정지되면 로그인·모든 요청이 막히고, 그 사람의 대본은 공개 목록에서 빠지며, 같은 이메일로 다시 가입할 수 없다.
   */
  async setStatus(admin: AuthUser, id: string, dto: SetUserStatusDto): Promise<AdminUserDto> {
    if (id === admin.id) throw new BadRequestException('자기 자신은 정지할 수 없습니다');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { roles: true, status: true } });
    if (!user || user.status === 'WITHDRAWN') throw new NotFoundException('사용자를 찾을 수 없습니다');
    if (user.roles.includes('ADMIN')) throw new ForbiddenException('관리자 계정은 정지할 수 없습니다');
    const suspend = dto.status === 'SUSPENDED';
    const { _count, ...updated } = await this.prisma.user.update({
      where: { id },
      data: suspend
        ? { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: dto.reason?.trim() || null }
        : { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
      select: USER_SELECT,
    });
    const openReportCount = await this.prisma.accountReport.count({ where: { targetId: id, status: 'OPEN' } });
    return { ...updated, scriptCount: _count.scripts, openReportCount };
  }

  /** 관리자 화면용: 숨김 포함 공개·숨김 대본 (작성 중 DRAFT는 제외) */
  async scripts(): Promise<AdminScriptDto[]> {
    const scripts = await this.prisma.script.findMany({
      where: { status: { in: ['PUBLISHED', 'HIDDEN'] } },
      select: SCRIPT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return scripts.map(({ author, ...s }) => ({ ...s, authorName: author.displayName }));
  }

  async hide(id: string, hidden = true): Promise<AdminScriptDto> {
    const script = await this.prisma.script.findUnique({ where: { id } });
    if (!script) throw new NotFoundException('대본을 찾을 수 없습니다');
    const status = hidden ? 'HIDDEN' : script.rightsDeclared ? 'PUBLISHED' : 'DRAFT';
    const { author, ...updated } = await this.prisma.script.update({
      where: { id },
      data: { status },
      select: SCRIPT_SELECT,
    });
    return { ...updated, authorName: author.displayName };
  }
}
