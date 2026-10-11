import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COIN_PACKAGES, COIN_PRICES, COIN_USE_LABEL, type CoinUseName } from './coin-pricing.js';
import type { CoinTransactionPageDto, WalletDto } from './wallet.dto.js';

type Tx = Prisma.TransactionClient;

/** 코인 부족: 402. 화면은 error 코드로 충전 안내를 띄운다 */
export class InsufficientCoinsException extends HttpException {
  constructor(required: number, balance: number, use: CoinUseName) {
    super(
      {
        message: `코인이 부족합니다 (${COIN_USE_LABEL[use]}: ${required}코인 필요, 보유 ${balance}코인)`,
        error: 'INSUFFICIENT_COINS',
        required,
        balance,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 코인 차감. 호출하는 쪽의 트랜잭션 안에서 부른다.
   * 잔액이 충분할 때만 줄이는 조건부 update라 동시에 눌러도 음수가 되지 않는다.
   */
  async spend(tx: Tx, userId: string, use: CoinUseName, refId?: string): Promise<number> {
    const cost = COIN_PRICES[use];
    const { count } = await tx.user.updateMany({
      where: { id: userId, coinBalance: { gte: cost } },
      data: { coinBalance: { decrement: cost } },
    });
    if (count === 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
      throw new InsufficientCoinsException(cost, user?.coinBalance ?? 0, use);
    }
    const { coinBalance } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
    await tx.coinTransaction.create({
      data: { userId, type: 'SPEND', amount: -cost, balanceAfter: coinBalance, use, refId: refId ?? null },
    });
    return coinBalance;
  }

  /** 코인 충전 (가입 보너스·구매·관리자 지급). 호출하는 쪽의 트랜잭션 안에서 부른다 */
  async credit(
    tx: Tx,
    userId: string,
    amount: number,
    type: 'SIGNUP_BONUS' | 'PURCHASE' | 'ADMIN_ADJUST',
    extra: { priceKrw?: number; memo?: string } = {},
  ): Promise<number> {
    const { coinBalance } = await tx.user.update({
      where: { id: userId },
      data: { coinBalance: { increment: amount } },
      select: { coinBalance: true },
    });
    await tx.coinTransaction.create({
      data: { userId, type, amount, balanceAfter: coinBalance, priceKrw: extra.priceKrw ?? null, memo: extra.memo ?? null },
    });
    return coinBalance;
  }

  async wallet(userId: string): Promise<WalletDto> {
    const { coinBalance } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coinBalance: true } });
    return {
      balance: coinBalance,
      prices: { ...COIN_PRICES },
      packages: COIN_PACKAGES.map((p) => ({ ...p })),
      testPayments: true,
    };
  }

  /** 코인 구매. 실제 결제는 아직 연동하지 않아 테스트 결제로 바로 충전한다 */
  async purchase(userId: string, packageId: string): Promise<WalletDto> {
    const pack = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pack) throw new BadRequestException('없는 코인 패키지입니다');
    await this.prisma.$transaction((tx) =>
      this.credit(tx, userId, pack.coins, 'PURCHASE', { priceKrw: pack.priceKrw, memo: `${pack.label} 테스트 결제` }),
    );
    return this.wallet(userId);
  }

  async history(userId: string, cursor?: string): Promise<CoinTransactionPageDto> {
    const take = 50;
    const rows = await this.prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map(({ userId: _u, ...r }) => r);
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  /** 관리자 지급·회수. 잔액이 음수가 되면 거부 */
  async adjust(userId: string, amount: number, memo?: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { coinBalance: true, status: true } });
    if (!user || user.status === 'WITHDRAWN') throw new NotFoundException('사용자를 찾을 수 없습니다');
    if (user.coinBalance + amount < 0) throw new BadRequestException(`회수할 수 있는 코인은 최대 ${user.coinBalance}개입니다`);
    return this.prisma.$transaction((tx) =>
      this.credit(tx, userId, amount, 'ADMIN_ADJUST', { memo: memo?.trim() || '관리자 조정' }),
    );
  }
}
