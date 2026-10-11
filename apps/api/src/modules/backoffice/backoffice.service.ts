import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AdminScriptDto, AdminUserDto } from './backoffice.dto.js';

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

@Injectable()
export class BackofficeService {
  constructor(private readonly prisma: PrismaService) {}

  async users(): Promise<AdminUserDto[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        roles: true,
        createdAt: true,
        _count: { select: { scripts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return users.map(({ _count, ...u }) => ({ ...u, scriptCount: _count.scripts }));
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
