import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateRoleRequestDto, RequestableRole, RoleRequestDto } from './membership.dto.js';

const INCLUDE = {
  user: { select: { id: true, email: true, displayName: true, roles: true } },
} as const;

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** 권한 신청. 이미 가진 역할이나 대기 중인 같은 신청이 있으면 막는다 */
  async request(user: AuthUser, dto: CreateRoleRequestDto): Promise<RoleRequestDto> {
    return this.create(user.id, dto.role, dto.message);
  }

  /** 가입과 함께 신청할 때도 쓰는 내부 함수 */
  async create(userId: string, role: RequestableRole, message?: string): Promise<RoleRequestDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } });
    if (user.roles.includes(role)) throw new BadRequestException('이미 가진 권한입니다');
    const pending = await this.prisma.roleRequest.findFirst({ where: { userId, role, status: 'PENDING' } });
    if (pending) throw new ConflictException('같은 권한 신청이 이미 승인 대기 중입니다');
    return this.prisma.roleRequest.create({
      data: { userId, role, message: message?.trim() || null },
      include: INCLUDE,
    }) as Promise<RoleRequestDto>;
  }

  mine(userId: string): Promise<RoleRequestDto[]> {
    return this.prisma.roleRequest.findMany({
      where: { userId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    }) as Promise<RoleRequestDto[]>;
  }

  /** 관리자: 신청 목록 (기본: 대기 중) */
  list(status?: RoleRequestDto['status']): Promise<RoleRequestDto[]> {
    return this.prisma.roleRequest.findMany({
      where: status ? { status } : {},
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    }) as Promise<RoleRequestDto[]>;
  }

  /** 관리자 승인: 신청을 APPROVED로 바꾸고 사용자에게 역할을 더한다 (한 트랜잭션) */
  async approve(id: string, admin: AuthUser): Promise<RoleRequestDto> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.roleRequest.findUnique({ where: { id }, include: { user: true } });
      if (!request) throw new NotFoundException('권한 신청을 찾을 수 없습니다');
      const { count } = await tx.roleRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedById: admin.id },
      });
      if (count === 0) throw new ConflictException(`이미 처리된 신청입니다 (${request.status})`);
      if (!request.user.roles.includes(request.role)) {
        await tx.user.update({
          where: { id: request.userId },
          data: { roles: { set: [...request.user.roles, request.role] } },
        });
      }
      return tx.roleRequest.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    }) as Promise<RoleRequestDto>;
  }

  async reject(id: string, admin: AuthUser): Promise<RoleRequestDto> {
    const request = await this.prisma.roleRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('권한 신청을 찾을 수 없습니다');
    const { count } = await this.prisma.roleRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedById: admin.id },
    });
    if (count === 0) throw new ConflictException(`이미 처리된 신청입니다 (${request.status})`);
    return this.prisma.roleRequest.findUniqueOrThrow({ where: { id }, include: INCLUDE }) as Promise<RoleRequestDto>;
  }
}
