import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { isCreatorReady } from '../../core/auth/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SIGNUP_BONUS } from '../wallet/coin-pricing.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { AuthResultDto, LoginDto, MeDto, SignupDto } from './identity.dto.js';

const ME_SELECT = {
  id: true,
  email: true,
  displayName: true,
  roles: true,
  createdAt: true,
  bio: true,
  profilePublic: true,
  emailPublic: true,
  coinBalance: true,
} as const;

type MeRow = Omit<MeDto, 'creatorReady'>;
const toMe = (u: MeRow): MeDto => ({ ...u, creatorReady: isCreatorReady(u) });

@Injectable()
export class IdentityService {
  // 없는 이메일에도 같은 비용의 검증을 해서 응답 시간으로 가입 여부를 알 수 없게 한다
  private readonly dummyHash = hash('not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wallet: WalletService,
  ) {}

  /** 가입은 항상 일반 계정이고 가입 보너스 코인을 준다. 정지된 계정의 이메일로는 가입할 수 없다 */
  async signup(dto: SignupDto): Promise<AuthResultDto> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { status: true } });
    if (exists?.status === 'SUSPENDED') {
      throw new ForbiddenException({ message: '이용이 정지된 이메일로는 가입할 수 없습니다', error: 'SUSPENDED_EMAIL' });
    }
    if (exists) throw new ConflictException('이미 가입된 이메일입니다');

    const passwordHash = await hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash, displayName: dto.displayName, roles: [] },
      });
      await this.wallet.credit(tx, created.id, SIGNUP_BONUS, 'SIGNUP_BONUS', { memo: '가입 보너스' });
      return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: ME_SELECT });
    });
    return { user: toMe(user), accessToken: await this.sign(user.id) };
  }

  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verify(user?.passwordHash ?? (await this.dummyHash), dto.password).catch(() => false);
    if (!user || !ok || user.status === 'WITHDRAWN') {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    if (user.status === 'SUSPENDED') {
      const reason = user.suspendReason ? ` (사유: ${user.suspendReason})` : '';
      throw new ForbiddenException({ message: `이용이 정지된 계정입니다${reason}`, error: 'ACCOUNT_SUSPENDED' });
    }
    return { user: await this.me(user.id), accessToken: await this.sign(user.id) };
  }

  async me(id: string): Promise<MeDto> {
    return toMe(await this.prisma.user.findUniqueOrThrow({ where: { id }, select: ME_SELECT }));
  }

  private sign(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }
}
