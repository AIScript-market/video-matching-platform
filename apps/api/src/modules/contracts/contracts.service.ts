import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import {
  renderChannelPublishing,
  renderNda,
  renderScriptLicense,
  sha256,
  SIGN_CONSENT,
  TEMPLATE_VERSIONS,
  type RenderedContract,
} from './contract-templates.js';
import type { ContractDto, ContractPreviewDto, ContractSummaryDto, SignContractDto } from './contracts.dto.js';

type Tx = Prisma.TransactionClient;
type Role = 'WRITER' | 'PRODUCER' | 'PLATFORM';

/** 서명 증거로 남기는 접속 정보 */
export interface SignatureMeta {
  ip: string | null;
  userAgent: string | null;
}

interface PartyInput {
  role: Role;
  userId: string | null;
  legalName: string;
  /** 만들 때 바로 서명된 당사자 (NDA의 제작자, 채널 게시 계약의 플랫폼) */
  signed?: { signedName: string; meta: SignatureMeta };
}

const INCLUDE = { parties: { orderBy: { role: 'asc' } } } as const;

/** 계약서에 적을 플랫폼 운영자 이름. 사업자 등록 뒤 상호로 바꾼다 */
export function platformName(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLATFORM_LEGAL_NAME?.trim() || '대본매칭 운영자';
}

const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 만들기 (다른 서비스의 트랜잭션 안에서 부른다) ----------

  private async create(
    tx: Tx,
    doc: RenderedContract,
    parties: PartyInput[],
    link: { dealId?: string; accessRequestId?: string } = {},
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
        parties: {
          create: parties.map((p) => ({
            role: p.role,
            userId: p.userId,
            legalName: p.legalName,
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
    p: { accessRequestId: string; script: { id: string; title: string }; writerName: string; producer: { id: string; displayName: string } },
    signedName: string,
    meta: SignatureMeta,
  ) {
    const doc = renderNda({ scriptTitle: p.script.title, scriptId: p.script.id, writerName: p.writerName, producerName: p.producer.displayName, date: new Date() });
    return this.create(tx, doc, [{ role: 'PRODUCER', userId: p.producer.id, legalName: p.producer.displayName, signed: { signedName, meta } }], {
      accessRequestId: p.accessRequestId,
    });
  }

  /** 제안 수락과 함께: 작가·제작자가 서명할 대본 이용허락 계약 */
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
    const doc = renderScriptLicense({
      scriptTitle: p.script.title,
      scriptId: p.script.id,
      writerName: p.writer.displayName,
      producerName: p.producer.displayName,
      platformName: platformName(),
      ...p.terms,
      date: new Date(),
    });
    return this.create(
      tx,
      doc,
      [
        { role: 'WRITER', userId: p.writer.id, legalName: p.writer.displayName },
        { role: 'PRODUCER', userId: p.producer.id, legalName: p.producer.displayName },
      ],
      { dealId: p.dealId },
    );
  }

  /** 제작자의 지금 버전 채널 게시 계약 (없으면 만든다. 플랫폼은 만들 때 서명) */
  async channelContract(user: Viewer & { displayName?: string }): Promise<ContractDto> {
    const existing = await this.currentChannelContract(user.id);
    if (existing) return this.toDto(existing, user);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true } });
    const doc = renderChannelPublishing({ producerName: me.displayName, platformName: platformName(), date: new Date() });
    const created = await this.prisma.$transaction((tx) =>
      this.create(tx, doc, [
        { role: 'PLATFORM', userId: null, legalName: platformName(), signed: { signedName: platformName(), meta: { ip: null, userAgent: 'platform' } } },
        { role: 'PRODUCER', userId: user.id, legalName: me.displayName },
      ]),
    );
    return this.get(created.id, user);
  }

  private currentChannelContract(userId: string) {
    return this.prisma.contract.findFirst({
      where: {
        kind: 'CHANNEL_PUBLISHING',
        templateVersion: TEMPLATE_VERSIONS.CHANNEL_PUBLISHING,
        status: { not: 'VOID' },
        parties: { some: { role: 'PRODUCER', userId } },
      },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 영상을 제출하려면 지금 버전 채널 게시 계약에 서명이 끝나 있어야 한다 */
  async hasSignedChannelContract(userId: string): Promise<boolean> {
    const c = await this.currentChannelContract(userId);
    return c?.status === 'SIGNED';
  }

  // ---------- 보기 ----------

  async previewNda(scriptId: string, producer: Viewer): Promise<ContractPreviewDto> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, status: true, author: { select: { displayName: true } } },
    });
    if (!script || script.status !== 'PUBLISHED') throw new NotFoundException('공개된 대본을 찾을 수 없습니다');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: producer.id }, select: { displayName: true } });
    const doc = renderNda({ scriptTitle: script.title, scriptId: script.id, writerName: script.author.displayName, producerName: me.displayName, date: new Date() });
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

  async forDeal(dealId: string, user: Viewer): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({ where: { dealId }, select: { id: true } });
    if (!c) throw new NotFoundException('이 딜의 계약서가 없습니다');
    return this.get(c.id, user);
  }

  // ---------- 서명 ----------

  /**
   * 당사자 서명. 입력한 이름이 계약서의 이름과 같아야 한다.
   * 마지막 서명이면 계약 SIGNED. 대본 이용허락이면 같은 트랜잭션에서 딜·라이선스를 ACTIVE로 바꾼다.
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
      where: { id, status: { not: 'VOID' } },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason.trim() },
    });
    if (count === 0) throw new ConflictException('없거나 이미 무효인 계약입니다');
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
      createdAt: Date;
      signedAt: Date | null;
      parties: Array<{ role: Role; userId: string | null; legalName: string; signedAt: Date | null; signedName: string | null }>;
    },
    user: Viewer,
  ): ContractSummaryDto {
    return {
      id: c.id,
      kind: c.kind,
      templateVersion: c.templateVersion,
      title: c.title,
      status: c.status,
      dealId: c.dealId,
      createdAt: c.createdAt,
      signedAt: c.signedAt,
      parties: c.parties.map(({ role, userId, legalName, signedAt, signedName }) => ({ role, userId, legalName, signedAt, signedName })),
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
