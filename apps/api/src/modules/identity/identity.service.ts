import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MembershipService } from '../membership/membership.service.js';
import type { AuthResultDto, LoginDto, MeDto, SignupDto } from './identity.dto.js';

const ME_SELECT = { id: true, email: true, displayName: true, roles: true, createdAt: true } as const;


@Injectable()
export class IdentityService {
  // 없는 이메일에도 같은 비용의 검증을 해서 응답 시간으로 가입 여부를 알 수 없게 한다
  private readonly dummyHash = hash('not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly membership: MembershipService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResultDto> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('이미 가입된 이메일입니다');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hash(dto.password),
        displayName: dto.displayName,
        roles: [], // 일반 계정으로 시작
      },
      select: ME_SELECT,
    });
    for (const role of new Set(dto.requestedRoles ?? [])) {
      await this.membership.create(user.id, role, '가입 시 신청');
    }
    return { user, accessToken: await this.sign(user.id) };
  }

  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verify(user?.passwordHash ?? (await this.dummyHash), dto.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    const { passwordHash: _hash, ...me } = user;
    return { user: me, accessToken: await this.sign(user.id) };
  }

  me(id: string): Promise<MeDto> {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: ME_SELECT });
  }

  private sign(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }
}
