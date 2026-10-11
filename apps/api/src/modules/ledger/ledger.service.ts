import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import { DealsService } from '../deals/deals.service.js';
import type { CreateLedgerEntryDto, LedgerDto, LedgerEntryDto } from './dto/ledger.dto.js';
import { ledgerTotals, validateLedgerAmount } from './ledger-rules.js';

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
  ) {}

  async get(dealId: string, user: Viewer): Promise<LedgerDto> {
    await this.deals.assertCanView(dealId, user);
    const entries = (await this.prisma.ledgerEntry.findMany({
      where: { dealId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    })) as LedgerEntryDto[];
    return { dealId, entries, totals: ledgerTotals(entries) };
  }

  /** MVP: 관리자 수동 기록만 (역할 검사는 컨트롤러의 @Roles('ADMIN')) */
  async record(dealId: string, admin: Viewer, dto: CreateLedgerEntryDto): Promise<LedgerEntryDto> {
    validateLedgerAmount(dto.type, dto.amountKrw);
    await this.deals.assertCanView(dealId, admin);
    return this.prisma.ledgerEntry.create({
      data: {
        dealId,
        type: dto.type,
        amountKrw: dto.amountKrw,
        memo: dto.memo?.trim() || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: admin.id,
      },
    }) as Promise<LedgerEntryDto>;
  }
}
