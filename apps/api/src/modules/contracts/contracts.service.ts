import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import {
  renderChannelPublishing,
  renderNda,
  renderScriptLicense,
  scriptContentSha256,
  sha256,
  SIGN_CONSENT,
  TEMPLATE_VERSIONS,
  type LicenseParty,
  type RenderedContract,
} from './contract-templates.js';
import type { AmendLicenseDto, ContractDto, ContractPreviewDto, ContractSummaryDto, SignContractDto } from './contracts.dto.js';
import { validateShares, type PartyShare } from './revenue-shares.js';

type Tx = Prisma.TransactionClient;
type Role = 'WRITER' | 'PRODUCER' | 'PLATFORM' | 'PERFORMER' | 'OTHER';

/** 서명 증거로 남기는 접속 정보 */
export interface SignatureMeta {
  ip: string | null;
  userAgent: string | null;
}

interface PartyInput {
  role: Role;
  userId: string | null;
  legalName: string;
  label?: string | null;
  revenueShareBp?: number | null;
  receivesRemainder?: boolean;
  /** 만들 때 바로 서명된 당사자 (NDA의 제작자, 플랫폼) */
  signed?: { signedName: string; meta: SignatureMeta };
}

const ROLE_ORDER: Record<Role, number> = { WRITER: 0, PRODUCER: 1, PERFORMER: 2, OTHER: 3, PLATFORM: 4 };
const INCLUDE = { parties: true } as const;

/** 계약서에 적을 플랫폼 운영자 이름. 사업자 등록 뒤 상호로 바꾼다 */
export function platformName(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLATFORM_LEGAL_NAME?.trim() || '대본매칭 운영자';
}

const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);
const platformParty = (): PartyInput => ({
  role: 'PLATFORM',
  userId: null,
  legalName: platformName(),
  signed: { signedName: platformName(), meta: { ip: null, userAgent: 'platform' } },
});

/** 다음 달 (YYYY-MM, UTC). 변경 계약은 서명이 끝난 다음 달 1일부터 적용한다 */
export function nextMonth(d: Date): string {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return n.toISOString().slice(0, 7);
}

/** 비밀유지 서약서에 적을 대본 정보 */
export const NDA_SCRIPT_SELECT = { id: true, title: true, logline: true, genre: true, fullText: true, previewText: true } as const;
export interface NdaScript {
  id: string;
  title: string;
  logline: string;
  genre: string;
  fullText: string;
  previewText: string | null;
}

function ndaInput(s: NdaScript, writerName: string, producerName: string) {
  return {
    scriptTitle: s.title,
    scriptId: s.id,
    scriptSha256: scriptContentSha256(s.fullText, s.previewText),
    logline: s.logline,
    genre: s.genre,
    writerName,
    producerName,
    platformName: platformName(),
    date: new Date(),
  };
}

function licenseParties(parties: PartyInput[]): LicenseParty[] {
  return [...parties]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map((p) => ({ role: p.role, name: p.legalName, label: p.label ?? null, revenueShareBp: p.revenueShareBp ?? null, receivesRemainder: Boolean(p.receivesRemainder) }));
}

function toShares(parties: PartyInput[]): PartyShare[] {
  return parties.map((p, i) => ({ key: String(i), role: p.role, revenueShareBp: p.revenueShareBp ?? null, receivesRemainder: Boolean(p.receivesRemainder) }));
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 만들기 (다른 서비스의 트랜잭션 안에서 부른다) ----------

  private async create(
    tx: Tx,
    doc: RenderedContract,
    parties: PartyInput[],
    link: { dealId?: string; accessRequestId?: string; supersedesId?: string } = {},
  ) {
    const now = new Date();
    const allSigned = parties.every((p) => p.signed);
    return tx.contract.create({
      data: {
        kind: doc.kind,
        templateVersion: doc.templateVersion,
        title: doc.title,
        body: doc.body,
        bodySha256: sha256(doc.body),
        status: allSigned ? 'SIGNED' : 'AWAITING_SIGNATURES',
        signedAt: allSigned ? now : null,
        dealId: link.dealId ?? null,
        accessRequestId: link.accessRequestId ?? null,
        supersedesId: link.supersedesId ?? null,
        parties: {
          create: parties.map((p) => ({
            role: p.role,
            userId: p.userId,
            legalName: p.legalName,
            label: p.label ?? null,
            revenueShareBp: p.revenueShareBp ?? null,
            receivesRemainder: Boolean(p.receivesRemainder),
            signedAt: p.signed ? now : null,
            signedName: p.signed?.signedName ?? null,
            ip: clip(p.signed?.meta.ip, 64),
            userAgent: clip(p.signed?.meta.userAgent, 400),
          })),
        },
      },
    });
  }

  /** 열람 요청과 함께: 제작자가 혼자 서명하는 비밀유지 서약서 */
  async createNda(
    tx: Tx,
    p: { accessRequestId: string; script: NdaScript; writerName: string; producer: { id: string; displayName: string } },
    signedName: string,
    meta: SignatureMeta,
  ) {
    const doc = renderNda(ndaInput(p.script, p.writerName, p.producer.displayName));
    return this.create(tx, doc, [{ role: 'PRODUCER', userId: p.producer.id, legalName: p.producer.displayName, signed: { signedName, meta } }], {
      accessRequestId: p.accessRequestId,
    });
  }

  /**
   * 제안 수락과 함께: 작가·제작자·플랫폼의 대본 이용허락 및 수익 배분 계약.
   * 플랫폼은 만들 때 서명하고, 작가·제작자가 서명하면 성립한다. 배분율은 수락된 제안의 작가 %·제작자 %, 내림 차이는 제작자.
   */
  async createScriptLicense(
    tx: Tx,
    p: {
      dealId: string;
      script: { id: string; title: string };
      writer: { id: string; displayName: string };
      producer: { id: string; displayName: string };
      terms: { writerSharePct: number; producerSharePct: number; upfrontFeeKrw: number; termMonths: number; exclusive: boolean; notes: string | null };
    },
  ) {
    const parties: PartyInput[] = [
      { role: 'WRITER', userId: p.writer.id, legalName: p.writer.displayName, revenueShareBp: p.terms.writerSharePct * 100 },
      { role: 'PRODUCER', userId: p.producer.id, legalName: p.producer.displayName, revenueShareBp: p.terms.producerSharePct * 100, receivesRemainder: true },
      platformParty(),
    ];
    validateShares(toShares(parties));
    const doc = renderScriptLicense({
      scriptTitle: p.script.title,
      scriptId: p.script.id,
      parties: licenseParties(parties),
      upfrontFeeKrw: p.terms.upfrontFeeKrw,
      termMonths: p.terms.termMonths,
      exclusive: p.terms.exclusive,
      notes: p.terms.notes,
      date: new Date(),
    });
    return this.create(tx, doc, parties, { dealId: p.dealId });
  }

  /**
   * 변경 계약 제안: 공동 작가·공동 제작자·출연자를 더하거나 배분율을 바꾼다. 딜의 작가·제작자 또는 관리자가 제안한다.
   * 지금 계약(서명 완료)의 작가·제작자는 빠질 수 없다. 모든 당사자가 서명하면 이전 계약은 SUPERSEDED가 되고,
   * 새 배분은 서명이 끝난 다음 달 1일부터 발생하는 수익에 적용된다.
   */
  async proposeAmendment(dealId: string, user: Viewer, dto: AmendLicenseDto): Promise<ContractDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { negotiation: { include: { script: { select: { id: true, title: true } } } } },
    });
    const isAdmin = user.roles.includes('ADMIN');
    if (!deal || !(isAdmin || deal.negotiation.writerId === user.id || deal.negotiation.producerId === user.id)) {
      throw new NotFoundException('딜을 찾을 수 없습니다');
    }
    const contracts = await this.prisma.contract.findMany({ where: { dealId, kind: 'SCRIPT_LICENSE' }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
    if (contracts.some((c) => c.status === 'AWAITING_SIGNATURES')) {
      throw new ConflictException('서명이 끝나지 않은 계약이 있습니다. 그 계약을 마치거나 무효로 한 뒤에 바꿀 수 있습니다');
    }
    const current = contracts.find((c) => c.status === 'SIGNED');
    if (!current) throw new ConflictException('서명이 끝난 이용허락 계약이 없습니다');

    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.parties.map((p) => p.userId) } },
      select: { id: true, displayName: true, status: true, roles: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    if (new Set(dto.parties.map((p) => p.userId)).size !== dto.parties.length) throw new BadRequestException('같은 사람을 두 번 넣을 수 없습니다');
    for (const p of dto.parties) {
      const u = byId.get(p.userId);
      if (!u || u.status !== 'ACTIVE' || u.roles.includes('ADMIN')) throw new BadRequestException('이용 중인 일반 계정만 당사자가 될 수 있습니다');
    }
    for (const keep of current.parties.filter((p) => p.role === 'WRITER' || p.role === 'PRODUCER')) {
      if (!dto.parties.some((p) => p.userId === keep.userId)) throw new BadRequestException(`지금 계약의 ${keep.role === 'WRITER' ? '작가' : '제작자'}(${keep.legalName})는 빠질 수 없습니다`);
    }
    const parties: PartyInput[] = [
      ...dto.parties.map((p) => ({
        role: p.role,
        userId: p.userId,
        legalName: byId.get(p.userId)!.displayName,
        label: p.label?.trim() || null,
        revenueShareBp: p.revenueShareBp,
        receivesRemainder: Boolean(p.receivesRemainder),
      })),
      platformParty(),
    ];
    validateShares(toShares(parties));
    const offer = await this.prisma.offer.findUniqueOrThrow({ where: { id: deal.acceptedOfferId } });
    const doc = renderScriptLicense({
      scriptTitle: deal.negotiation.script.title,
      scriptId: deal.negotiation.script.id,
      parties: licenseParties(parties),
      upfrontFeeKrw: offer.upfrontFeeKrw,
      termMonths: offer.termMonths,
      exclusive: offer.exclusive,
      notes: [offer.notes, dto.notes?.trim()].filter(Boolean).join(' / ') || null,
      amends: { contractId: current.id, bodySha256: current.bodySha256 },
      date: new Date(),
    });
    const created = await this.prisma.$transaction((tx) => this.create(tx, doc, parties, { dealId, supersedesId: current.id }));
    return this.get(created.id, user);
  }

  /**
   * 제작자의 지금 버전 채널 게시 계약 (없으면 만든다. 플랫폼은 만들 때 서명).
   * 화면이 동시에 여러 번 불러도 한 장만 생기도록, 제작자마다 트랜잭션 잠금을 걸고 확인한 뒤 만든다.
   */
  async channelContract(user: Viewer & { displayName?: string }): Promise<ContractDto> {
    const existing = await this.currentChannelContract(this.prisma, user.id);
    if (existing) return this.toDto(existing, user);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true } });
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`channel-contract:${user.id}`}))`;
      const again = await this.currentChannelContract(tx, user.id);
      if (again) return again.id;
      const doc = renderChannelPublishing({ producerName: me.displayName, platformName: platformName(), date: new Date() });
      return (await this.create(tx, doc, [platformParty(), { role: 'PRODUCER', userId: user.id, legalName: me.displayName }])).id;
    });
    return this.get(id, user);
  }

  /** 지금 버전 채널 게시 계약: 서명이 끝난 것이 있으면 그것, 없으면 가장 먼저 만든 서명 대기 계약 */
  private async currentChannelContract(db: Tx | PrismaService, userId: string) {
    const rows = await db.contract.findMany({
      where: {
        kind: 'CHANNEL_PUBLISHING',
        templateVersion: TEMPLATE_VERSIONS.CHANNEL_PUBLISHING,
        status: { in: ['SIGNED', 'AWAITING_SIGNATURES'] },
        parties: { some: { role: 'PRODUCER', userId } },
      },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.find((c) => c.status === 'SIGNED') ?? rows[0] ?? null;
  }

  /** 영상을 제출하려면 지금 버전 채널 게시 계약에 서명이 끝나 있어야 한다 */
  async hasSignedChannelContract(userId: string): Promise<boolean> {
    const c = await this.currentChannelContract(this.prisma, userId);
    return c?.status === 'SIGNED';
  }

  /**
   * 그 달의 수익에 적용할 이용허락 계약: 서명이 끝났고(SIGNED 또는 이후 대체됨) 적용 시작 달이 그 달 이전인 것 중 가장 늦게 시작한 것.
   * 정산 서비스가 쓴다.
   */
  async applicableLicense(dealId: string, month: string) {
    const rows = await this.prisma.contract.findMany({
      where: { dealId, kind: 'SCRIPT_LICENSE', status: { in: ['SIGNED', 'SUPERSEDED'] } },
      include: INCLUDE,
    });
    const eligible = rows.filter((c) => !c.effectiveMonth || c.effectiveMonth <= month);
    eligible.sort((a, b) => (a.effectiveMonth ?? '').localeCompare(b.effectiveMonth ?? '') || a.createdAt.getTime() - b.createdAt.getTime());
    return eligible.at(-1) ?? null;
  }

  // ---------- 보기 ----------

  async previewNda(scriptId: string, producer: Viewer): Promise<ContractPreviewDto> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      select: { ...NDA_SCRIPT_SELECT, status: true, author: { select: { displayName: true } } },
    });
    if (!script || script.status !== 'PUBLISHED') throw new NotFoundException('공개된 대본을 찾을 수 없습니다');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: producer.id }, select: { displayName: true } });
    const doc = renderNda(ndaInput(script, script.author.displayName, me.displayName));
    return { templateVersion: doc.templateVersion, title: doc.title, body: doc.body, signConsent: SIGN_CONSENT };
  }

  /** 내가 당사자인 계약 (관리자는 전체) */
  async list(user: Viewer): Promise<ContractSummaryDto[]> {
    const isAdmin = user.roles.includes('ADMIN');
    const rows = await this.prisma.contract.findMany({
      where: isAdmin ? {} : { parties: { some: { userId: user.id } } },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.toSummary(r, user));
  }

  async get(id: string, user: Viewer): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({
      where: { id },
      include: { ...INCLUDE, accessRequest: { select: { script: { select: { authorId: true } } } } },
    });
    // 당사자, 관리자, 그리고 비밀유지 서약서는 보호받는 작가도 볼 수 있다. 아니면 존재를 숨긴다
    const ok =
      c &&
      (user.roles.includes('ADMIN') ||
        c.parties.some((p) => p.userId === user.id) ||
        c.accessRequest?.script.authorId === user.id);
    if (!ok) throw new NotFoundException('계약을 찾을 수 없습니다');
    return this.toDto(c, user);
  }

  /** 딜의 지금 이용허락 계약: 서명 중인 변경 계약이 있으면 그것, 아니면 서명이 끝난 것 */
  async forDeal(dealId: string, user: Viewer): Promise<ContractDto> {
    const rows = await this.prisma.contract.findMany({
      where: { dealId, kind: 'SCRIPT_LICENSE', status: { in: ['AWAITING_SIGNATURES', 'SIGNED'] } },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    const c = rows[0];
    if (!c) throw new NotFoundException('이 딜의 계약서가 없습니다');
    return this.get(c.id, user);
  }

  /** 딜의 이용허락 계약 이력 (처음 계약과 변경 계약들, 최신순) */
  async historyForDeal(dealId: string, user: Viewer): Promise<ContractSummaryDto[]> {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, select: { negotiation: { select: { writerId: true, producerId: true } } } });
    const rows = await this.prisma.contract.findMany({ where: { dealId, kind: 'SCRIPT_LICENSE' }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
    const ok =
      deal &&
      (user.roles.includes('ADMIN') ||
        deal.negotiation.writerId === user.id ||
        deal.negotiation.producerId === user.id ||
        rows.some((c) => c.parties.some((p) => p.userId === user.id)));
    if (!ok) throw new NotFoundException('딜을 찾을 수 없습니다');
    return rows.map((r) => this.toSummary(r, user));
  }

  // ---------- 서명 ----------

  /**
   * 당사자 서명. 입력한 이름이 계약서의 이름과 같아야 한다.
   * 마지막 서명이면 계약 SIGNED. 처음 이용허락 계약이면 딜·라이선스를 ACTIVE로, 변경 계약이면 이전 계약을 SUPERSEDED로 바꾸고 적용 시작 달을 정한다.
   */
  async sign(id: string, user: Viewer, dto: SignContractDto, meta: SignatureMeta): Promise<ContractDto> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.contract.findUnique({ where: { id }, include: { parties: true, deal: { include: { licenses: true } } } });
      const party = c?.parties.find((p) => p.userId === user.id && p.role !== 'PLATFORM');
      if (!c || !party) throw new NotFoundException('계약을 찾을 수 없습니다');
      if (c.status !== 'AWAITING_SIGNATURES') throw new ConflictException('서명할 수 없는 계약입니다 (이미 서명이 끝났거나 무효)');
      if (party.signedAt) throw new ConflictException('이미 서명했습니다');
      if (dto.signedName !== party.legalName.trim()) {
        throw new BadRequestException({ message: `계약서에 적힌 이름(${party.legalName})을 그대로 입력해 주세요`, error: 'SIGNED_NAME_MISMATCH' });
      }
      const now = new Date();
      const { count } = await tx.contractParty.updateMany({
        where: { id: party.id, signedAt: null },
        data: { signedAt: now, signedName: dto.signedName, ip: clip(meta.ip, 64), userAgent: clip(meta.userAgent, 400) },
      });
      if (count === 0) throw new ConflictException('이미 서명했습니다');
      const left = await tx.contractParty.count({ where: { contractId: id, signedAt: null } });
      if (left > 0) return;
      if (c.kind === 'SCRIPT_LICENSE' && c.supersedesId) {
        const { count: replaced } = await tx.contract.updateMany({ where: { id: c.supersedesId, status: 'SIGNED' }, data: { status: 'SUPERSEDED' } });
        if (replaced === 0) throw new ConflictException('바꾸려는 계약이 더 이상 유효하지 않습니다');
        await tx.contract.update({ where: { id }, data: { status: 'SIGNED', signedAt: now, effectiveMonth: nextMonth(now) } });
        return;
      }
      await tx.contract.update({ where: { id }, data: { status: 'SIGNED', signedAt: now } });
      if (c.kind === 'SCRIPT_LICENSE' && c.deal) await this.activateDeal(tx, c.deal, now);
    });
    return this.get(id, user);
  }

  private async activateDeal(
    tx: Tx,
    deal: { id: string; acceptedOfferId: string; licenses: Array<{ id: string }> },
    now: Date,
  ): Promise<void> {
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: deal.acceptedOfferId }, select: { termMonths: true } });
    const ends = new Date(now);
    ends.setUTCMonth(ends.getUTCMonth() + offer.termMonths);
    await tx.deal.update({ where: { id: deal.id }, data: { status: 'ACTIVE' } });
    await tx.license.updateMany({ where: { dealId: deal.id, status: 'DRAFT' }, data: { status: 'ACTIVE', startsAt: now, endsAt: ends } });
  }

  /** 관리자: 계약 무효 처리 (잘못 만들어졌거나 분쟁으로 해지). 서명 기록은 지우지 않는다 */
  async void(id: string, admin: Viewer, reason: string): Promise<ContractDto> {
    if (!admin.roles.includes('ADMIN')) throw new ForbiddenException('관리자만 무효 처리할 수 있습니다');
    const { count } = await this.prisma.contract.updateMany({
      where: { id, status: { notIn: ['VOID', 'SUPERSEDED'] } },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason.trim() },
    });
    if (count === 0) throw new ConflictException('없거나 이미 무효·대체된 계약입니다');
    return this.get(id, admin);
  }

  // ---------- 변환 ----------

  private toSummary(
    c: {
      id: string;
      kind: ContractSummaryDto['kind'];
      templateVersion: string;
      title: string;
      status: ContractSummaryDto['status'];
      dealId: string | null;
      supersedesId: string | null;
      effectiveMonth: string | null;
      createdAt: Date;
      signedAt: Date | null;
      parties: Array<{
        id: string;
        role: Role;
        userId: string | null;
        legalName: string;
        label: string | null;
        revenueShareBp: number | null;
        receivesRemainder: boolean;
        signedAt: Date | null;
        signedName: string | null;
      }>;
    },
    user: Viewer,
  ): ContractSummaryDto {
    const parties = [...c.parties].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.legalName.localeCompare(b.legalName));
    return {
      id: c.id,
      kind: c.kind,
      templateVersion: c.templateVersion,
      title: c.title,
      status: c.status,
      dealId: c.dealId,
      supersedesId: c.supersedesId,
      effectiveMonth: c.effectiveMonth,
      createdAt: c.createdAt,
      signedAt: c.signedAt,
      parties: parties.map(({ id, role, userId, legalName, label, revenueShareBp, receivesRemainder, signedAt, signedName }) => ({
        id,
        role,
        userId,
        legalName,
        label,
        revenueShareBp,
        receivesRemainder,
        signedAt,
        signedName,
      })),
      awaitingMySignature: c.status === 'AWAITING_SIGNATURES' && c.parties.some((p) => p.userId === user.id && !p.signedAt),
    };
  }

  private toDto(
    c: Parameters<ContractsService['toSummary']>[0] & { body: string; bodySha256: string; voidedAt: Date | null; voidReason: string | null },
    user: Viewer,
  ): ContractDto {
    return Object.assign(this.toSummary(c, user), {
      body: c.body,
      bodySha256: c.bodySha256,
      voidedAt: c.voidedAt,
      voidReason: c.voidReason,
      signConsent: SIGN_CONSENT,
    });
  }
}
