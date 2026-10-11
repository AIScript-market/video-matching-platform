import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { isCreatorReady, type AuthUser } from '../../core/auth/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicProfileDto, UpdateProfileDto } from './profiles.dto.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 공개 프로필. 비공개거나 정지·탈퇴한 계정은 본인과 관리자 외에는 404 */
  async get(id: string, viewer: AuthUser | null): Promise<PublicProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        bio: true,
        email: true,
        roles: true,
        profilePublic: true,
        emailPublic: true,
        status: true,
        createdAt: true,
        scripts: {
          where: { status: 'PUBLISHED' },
          select: { id: true, title: true, genre: true, logline: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    const privileged = viewer && (viewer.id === id || viewer.roles.includes('ADMIN'));
    if (!user || (!privileged && (!user.profilePublic || user.status !== 'ACTIVE'))) {
      throw new NotFoundException('공개된 프로필이 없습니다');
    }
    const { email, roles, status: _status, ...rest } = user;
    return {
      ...rest,
      email: user.emailPublic || privileged ? email : null,
      creatorReady: isCreatorReady({ ...user, roles }),
    };
  }

  async update(user: AuthUser, dto: UpdateProfileDto) {
    const bio = dto.bio !== undefined ? dto.bio.trim() || null : user.bio;
    const profilePublic = dto.profilePublic ?? user.profilePublic;
    if (profilePublic && !bio) {
      throw new BadRequestException('프로필을 공개하려면 소개를 먼저 써 주세요');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio }),
        ...(dto.profilePublic !== undefined && { profilePublic: dto.profilePublic }),
        ...(dto.emailPublic !== undefined && { emailPublic: dto.emailPublic }),
      },
    });
  }

  /**
   * 탈퇴. 기록(메시지·딜 등)은 남기되 개인정보를 지우고, 이메일을 비워 같은 이메일로 다시 가입할 수 있게 한다.
   * 공개 대본은 내리고, 진행 중인 협상은 종료하고, 대기 중인 열람 요청은 거절 처리한다. 남은 코인은 소멸한다.
   */
  async withdraw(user: AuthUser, password: string) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    const ok = await verify(row.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('비밀번호가 올바르지 않습니다');
    if (user.roles.includes('ADMIN')) throw new BadRequestException('관리자 계정은 탈퇴할 수 없습니다');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.script.updateMany({ where: { authorId: user.id, status: 'PUBLISHED' }, data: { status: 'DRAFT' } });
      await tx.negotiation.updateMany({
        where: { status: 'OPEN', OR: [{ writerId: user.id }, { producerId: user.id }] },
        data: { status: 'CLOSED' },
      });
      await tx.scriptAccessRequest.updateMany({
        where: { status: 'PENDING', OR: [{ producerId: user.id }, { script: { authorId: user.id } }] },
        data: { status: 'REJECTED', decidedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: now,
          email: `withdrawn+${user.id}@deleted.invalid`,
          passwordHash: '!',
          displayName: '탈퇴한 회원',
          bio: null,
          profilePublic: false,
          emailPublic: false,
          coinBalance: 0,
        },
      });
    });
  }
}
