import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import type { CastingOffer, CastingRole, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDays,
  addMonths,
  DEFAULT_EARLY_TERMINATION_PCT,
  earlyTerminationAmount,
  minorTagViolations,
  missingTags,
} from '../talent/likeness-policy.js';
import { TalentService } from '../talent/talent.service.js';
import type {
  AcceptCastingDto,
  CastingContractDto,
  CastingNegotiationDto,
  CastingOfferDto,
  CastingSide,
  CreateCastingOfferDto,
  CreateProjectDto,
  CreateRoleDto,
  EarlyTerminationQuoteDto,
  FeeType,
  ProjectDto,
  RoleDto,
} from './casting.dto.js';

type CastingUser = Pick<AuthUser, 'id' | 'roles'>;

const isAdmin = (u: CastingUser) => u.roles.includes('ADMIN');
const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'P2002';

/** 딜의 작가·제작자 = 기획사 구성원 */
const STUDIO_SELECT = {
  negotiation: {
    select: {
      writerId: true,
      producerId: true,
      scriptId: true,
      writer: { select: { id: true, displayName: true } },
      producer: { select: { id: true, displayName: true } },
      script: { select: { title: true } },
    },
  },
} satisfies Prisma.DealSelect;

const PROJECT_INCLUDE = { deal: { select: STUDIO_SELECT } } satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

export function projectMemberIds(p: { deal: { negotiation: { writerId: string; producerId: string } } }): string[] {
  return [p.deal.negotiation.writerId, p.deal.negotiation.producerId];
}

/** 사용자가 구성원인 작품을 고르는 where */
export function studioMemberWhere(userId: string): Prisma.ProjectWhereInput {
  return { deal: { negotiation: { OR: [{ writerId: userId }, { producerId: userId }] } } };
}

const NEGOTIATION_INCLUDE = {
  role: { include: { project: { include: PROJECT_INCLUDE } } },
  talent: { select: { id: true, userId: true, guardianId: true, stageName: true, minFeeKrw: true } },
  contract: { select: { id: true } },
  offers: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.CastingNegotiationInclude;
type NegotiationRow = Prisma.CastingNegotiationGetPayload<{ include: typeof NEGOTIATION_INCLUDE }>;

const CONTRACT_INCLUDE = {
  role: { select: { name: true } },
  talent: { select: { stageName: true, userId: true, guardianId: true } },
  project: { select: { title: true } },
} satisfies Prisma.CastingContractInclude;
type ContractRow = Prisma.CastingContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

function toProjectDto(p: ProjectRow): ProjectDto {
  const n = p.deal.negotiation;
  return {
    id: p.id,
    dealId: p.dealId,
    scriptId: n.scriptId,
    scriptTitle: n.script.title,
    title: p.title,
    members: [n.writer, n.producer],
    createdAt: p.createdAt,
  };
}

function toRoleDto(r: CastingRole & { project: { title: string } }): RoleDto {
  return {
    id: r.id,
    projectId: r.projectId,
    projectTitle: r.project.title,
    name: r.name,
    description: r.description,
    isMinorRole: r.isMinorRole,
    contentTags: r.contentTags,
    status: r.status,
    createdAt: r.createdAt,
  };
}

export function toOfferDto(o: CastingOffer): CastingOfferDto {
  return {
    id: o.id,
    negotiationId: o.negotiationId,
    proposerId: o.proposerId,
    side: o.side,
    feeType: o.feeType,
    flatFeeKrw: o.flatFeeKrw,
    perEpisodeFeeKrw: o.perEpisodeFeeKrw,
    episodes: o.episodes,
    revenueSharePct: o.revenueSharePct,
    usage: o.usage,
    termMonths: o.termMonths,
    exclusive: o.exclusive,
    requiresTalentApproval: o.requiresTalentApproval,
    productionDays: o.productionDays,
    earlyTerminationPct: o.earlyTerminationPct,
    note: o.note,
    status: o.status,
    createdAt: o.createdAt,
  };
}

function toContractDto(c: ContractRow): CastingContractDto {
  return {
    id: c.id,
    projectId: c.projectId,
    projectTitle: c.project.title,
    roleId: c.roleId,
    roleName: c.role.name,
    talentId: c.talentId,
    talentStageName: c.talent.stageName,
    feeType: c.feeType,
    flatFeeKrw: c.flatFeeKrw,
    perEpisodeFeeKrw: c.perEpisodeFeeKrw,
    episodes: c.episodes,
    revenueSharePct: c.revenueSharePct,
    usage: c.usage,
    contentTags: c.contentTags,
    exclusive: c.exclusive,
    requiresTalentApproval: c.requiresTalentApproval,
    earlyTerminationPct: c.earlyTerminationPct,
    guardianApprovedAt: c.guardianApprovedAt,
    startsAt: c.startsAt,
    productionEndsAt: c.productionEndsAt,
    endsAt: c.endsAt,
    status: c.status,
    terminationReason: c.terminationReason,
  };
}

interface Party {
  side: CastingSide;
  isGuardian: boolean;
}

function partyOf(userId: string, n: NegotiationRow): Party | null {
  if (projectMemberIds(n.role.project).includes(userId)) return { side: 'STUDIO', isGuardian: false };
  if (n.talent.userId === userId) return { side: 'TALENT', isGuardian: false };
  if (n.talent.guardianId === userId) return { side: 'TALENT', isGuardian: true };
  return null;
}

/** 보장액(고정 또는 회당×회차). 출연자의 최저 출연료와 비교한다 */
function guaranteedKrw(o: { feeType: FeeType; flatFeeKrw: number; perEpisodeFeeKrw: number; episodes: number | null }): number {
  if (o.feeType === 'PER_EPISODE') return o.perEpisodeFeeKrw * (o.episodes ?? 0);
  if (o.feeType === 'REVENUE_SHARE') return 0;
  return o.flatFeeKrw;
}

/** 방식에 맞지 않는 금액 칸은 0으로 정리하고, 빠진 조건은 거절한다 */
export function feeTerms(dto: CreateCastingOfferDto) {
  const flat = dto.flatFeeKrw ?? 0;
  const perEpisode = dto.perEpisodeFeeKrw ?? 0;
  const pct = dto.revenueSharePct ?? 0;
  switch (dto.feeType) {
    case 'FLAT':
      if (flat <= 0) throw new BadRequestException('고정 출연료(flatFeeKrw)를 입력해 주세요');
      return { flatFeeKrw: flat, perEpisodeFeeKrw: 0, episodes: null, revenueSharePct: 0 };
    case 'PER_EPISODE':
      if (perEpisode <= 0 || !dto.episodes) throw new BadRequestException('회당 출연료(perEpisodeFeeKrw)와 회차 수(episodes)를 입력해 주세요');
      return { flatFeeKrw: 0, perEpisodeFeeKrw: perEpisode, episodes: dto.episodes, revenueSharePct: 0 };
    case 'REVENUE_SHARE':
      if (pct <= 0) throw new BadRequestException('수익 배분 비율(revenueSharePct)을 입력해 주세요');
      return { flatFeeKrw: 0, perEpisodeFeeKrw: 0, episodes: null, revenueSharePct: pct };
    case 'HYBRID':
      if (flat <= 0 || pct <= 0) throw new BadRequestException('혼합 방식은 고정 출연료와 수익 배분 비율이 모두 필요합니다');
      return { flatFeeKrw: flat, perEpisodeFeeKrw: 0, episodes: null, revenueSharePct: pct };
  }
}

@Injectable()
export class CastingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly talent: TalentService,
  ) {}

  // --- 작품·배역 ----------------------------------------------------------------

  async createProject(user: CastingUser, dealId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, negotiation: { OR: [{ writerId: user.id }, { producerId: user.id }] } },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException('딜을 찾을 수 없습니다');
    try {
      return toProjectDto(await this.prisma.project.create({ data: { dealId, title: dto.title.trim() }, include: PROJECT_INCLUDE }));
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('이 딜에는 이미 작품이 있습니다');
      throw err;
    }
  }

  async listProjects(user: CastingUser): Promise<ProjectDto[]> {
    const rows = await this.prisma.project.findMany({
      where: isAdmin(user) ? {} : studioMemberWhere(user.id),
      include: PROJECT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toProjectDto);
  }

  async getProject(user: CastingUser, projectId: string): Promise<ProjectDto> {
    return toProjectDto(await this.memberProject(user, projectId, { allowAdmin: true }));
  }

  /** 딜에 연결된 작품 (없으면 null) */
  async projectForDeal(user: CastingUser, dealId: string): Promise<ProjectDto | null> {
    const row = await this.prisma.project.findFirst({
      where: { dealId, ...(isAdmin(user) ? {} : studioMemberWhere(user.id)) },
      include: PROJECT_INCLUDE,
    });
    return row && toProjectDto(row);
  }

  async createRole(user: CastingUser, projectId: string, dto: CreateRoleDto): Promise<RoleDto> {
    const project = await this.memberProject(user, projectId);
    if (dto.isMinorRole) {
      const banned = minorTagViolations(dto.contentTags);
      if (banned.length) throw new BadRequestException(`미성년 배역에는 넣을 수 없는 장면 유형입니다: ${banned.join(', ')}`);
    }
    const row = await this.prisma.castingRole.create({
      data: {
        projectId: project.id,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isMinorRole: Boolean(dto.isMinorRole),
        contentTags: dto.contentTags,
      },
      include: { project: { select: { title: true } } },
    });
    return toRoleDto(row);
  }

  async listRoles(user: CastingUser, projectId: string): Promise<RoleDto[]> {
    await this.memberProject(user, projectId, { allowAdmin: true });
    const rows = await this.prisma.castingRole.findMany({
      where: { projectId },
      include: { project: { select: { title: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRoleDto);
  }

  /** 공개 오디션: 지금 캐스팅 중인 배역 */
  async openRoles(): Promise<RoleDto[]> {
    const rows = await this.prisma.castingRole.findMany({
      where: { status: 'OPEN' },
      include: { project: { select: { title: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map(toRoleDto);
  }

  // --- 캐스팅 협상 ---------------------------------------------------------------

  /** 출연자가 배역에 지원한다 */
  async apply(user: CastingUser, roleId: string, message?: string): Promise<CastingNegotiationDto> {
    const profile = await this.prisma.talentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) throw new NotFoundException('출연자로 먼저 등록해 주세요');
    const n = await this.openNegotiation(roleId, profile.id, 'TALENT', message, null);
    return this.toNegotiationDto(n, user.id);
  }

  /** 기획사가 출연자에게 출연을 제안한다 */
  async invite(user: CastingUser, roleId: string, talentId: string, message?: string): Promise<CastingNegotiationDto> {
    const n = await this.openNegotiation(roleId, talentId, 'STUDIO', message, user.id);
    return this.toNegotiationDto(n, user.id);
  }

  private async openNegotiation(roleId: string, talentId: string, side: CastingSide, message: string | undefined, studioUserId: string | null) {
    const role = await this.prisma.castingRole.findUnique({ where: { id: roleId }, include: { project: { include: PROJECT_INCLUDE } } });
    if (!role || (studioUserId && !projectMemberIds(role.project).includes(studioUserId))) throw new NotFoundException('배역을 찾을 수 없습니다');
    if (role.status !== 'OPEN') throw new ConflictException('캐스팅이 끝난 배역입니다');
    const fit = await this.assertFit(role, talentId);
    if (projectMemberIds(role.project).includes(fit.profile.userId)) throw new BadRequestException('자기 작품에는 출연자로 지원할 수 없습니다');
    try {
      return await this.prisma.castingNegotiation.create({
        data: { roleId, talentId, initiatedBy: side, message: message?.trim() || null },
        include: NEGOTIATION_INCLUDE,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('이 배역과 출연자의 캐스팅 협상이 이미 있습니다');
      throw err;
    }
  }

  async listNegotiations(user: CastingUser): Promise<CastingNegotiationDto[]> {
    const rows = await this.prisma.castingNegotiation.findMany({
      where: {
        OR: [{ talent: { userId: user.id } }, { talent: { guardianId: user.id } }, { role: { project: studioMemberWhere(user.id) } }],
      },
      include: NEGOTIATION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toNegotiationDto(r, user.id)));
  }

  async getNegotiation(user: CastingUser, id: string): Promise<CastingNegotiationDto> {
    const { negotiation } = await this.participating(user, id);
    return this.toNegotiationDto(negotiation, user.id);
  }

  /** 출연료 제안 / 역제안. 상대의 열린 제안은 COUNTERED, 내 쪽의 이전 제안은 WITHDRAWN. 열린 제안은 항상 하나 */
  async createOffer(user: CastingUser, negotiationId: string, dto: CreateCastingOfferDto): Promise<CastingOfferDto> {
    const { negotiation, party } = await this.participating(user, negotiationId);
    if (negotiation.status !== 'OPEN') throw new ConflictException('끝난 캐스팅 협상입니다');
    await this.assertFit(negotiation.role, negotiation.talentId);
    const fees = feeTerms(dto);
    if (party.side === 'STUDIO' && guaranteedKrw({ feeType: dto.feeType, ...fees }) < negotiation.talent.minFeeKrw) {
      throw new BadRequestException(`출연자의 최저 출연료는 ${negotiation.talent.minFeeKrw.toLocaleString('ko-KR')}원입니다`);
    }

    const now = new Date();
    const offer = await this.prisma.$transaction(async (tx) => {
      // 협상 행을 잠가 동시에 들어온 제안·수락이 순서대로 처리되게 한다
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "CastingNegotiation" WHERE "id" = ${negotiationId} FOR UPDATE`;
      if (locked[0]?.status !== 'OPEN') throw new ConflictException('끝난 캐스팅 협상입니다');
      const open = ['PROPOSED', 'PENDING_GUARDIAN'] as const;
      await tx.castingOffer.updateMany({
        where: { negotiationId, status: { in: [...open] }, side: { not: party.side } },
        data: { status: 'COUNTERED', respondedAt: now },
      });
      await tx.castingOffer.updateMany({
        where: { negotiationId, status: { in: [...open] }, side: party.side },
        data: { status: 'WITHDRAWN', respondedAt: now },
      });
      const created = await tx.castingOffer.create({
        data: {
          negotiationId,
          proposerId: user.id,
          side: party.side,
          feeType: dto.feeType,
          ...fees,
          usage: dto.usage,
          termMonths: dto.termMonths,
          exclusive: dto.exclusive,
          requiresTalentApproval: dto.requiresTalentApproval ?? true,
          productionDays: dto.productionDays,
          earlyTerminationPct: dto.earlyTerminationPct ?? DEFAULT_EARLY_TERMINATION_PCT,
          note: dto.note?.trim() || null,
        },
      });
      await tx.castingNegotiation.update({ where: { id: negotiationId }, data: { updatedAt: now } });
      return created;
    });
    return toOfferDto(offer);
  }

  /**
   * 수락은 상대방만. 미성년자는 보호자가 수락하거나 직접 낸 제안이면 바로 계약,
   * 아니면 보호자 결정을 기다리는 PENDING_GUARDIAN이 된다.
   */
  async accept(user: CastingUser, offerId: string): Promise<AcceptCastingDto> {
    const offer = await this.prisma.castingOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('제안을 찾을 수 없습니다');
    const { negotiation, party } = await this.participating(user, offer.negotiationId);
    if (party.side === offer.side) throw new ForbiddenException('내 쪽에서 낸 제안은 수락할 수 없습니다');
    if (offer.status !== 'PROPOSED') throw new ConflictException('이미 처리된 제안입니다');
    const fit = await this.assertFit(negotiation.role, negotiation.talentId);

    if (fit.isMinor) {
      const guardianApproved = party.isGuardian || (offer.side === 'TALENT' && offer.proposerId === negotiation.talent.guardianId);
      if (!guardianApproved) {
        const { count } = await this.prisma.castingOffer.updateMany({
          where: { id: offerId, status: 'PROPOSED' },
          data: { status: 'PENDING_GUARDIAN' },
        });
        if (count === 0) throw new ConflictException('이미 처리된 제안입니다');
        return { status: 'PENDING_GUARDIAN', offer: toOfferDto(await this.prisma.castingOffer.findUniqueOrThrow({ where: { id: offerId } })), contract: null };
      }
    }
    return this.contract(offer, negotiation, fit.isMinor ? new Date() : null, 'PROPOSED');
  }

  /** 보호자의 승인 또는 거절 */
  async guardianDecision(user: CastingUser, offerId: string, approve: boolean): Promise<AcceptCastingDto> {
    const offer = await this.prisma.castingOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('제안을 찾을 수 없습니다');
    const { negotiation, party } = await this.participating(user, offer.negotiationId);
    if (!party.isGuardian) throw new ForbiddenException('출연자의 보호자만 결정할 수 있습니다');
    if (offer.status !== 'PENDING_GUARDIAN') throw new ConflictException('보호자 승인을 기다리는 제안이 아닙니다');
    if (!approve) {
      const { count } = await this.prisma.castingOffer.updateMany({
        where: { id: offerId, status: 'PENDING_GUARDIAN' },
        data: { status: 'REJECTED_BY_GUARDIAN', respondedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('이미 처리된 제안입니다');
      return { status: 'REJECTED_BY_GUARDIAN', offer: toOfferDto(await this.prisma.castingOffer.findUniqueOrThrow({ where: { id: offerId } })), contract: null };
    }
    await this.assertFit(negotiation.role, negotiation.talentId);
    return this.contract(offer, negotiation, new Date(), 'PENDING_GUARDIAN');
  }

  /** 한 트랜잭션: 제안 ACCEPTED, 협상 AGREED, 배역 CAST, 같은 배역의 다른 협상 종료, 계약 생성 */
  private async contract(offer: CastingOffer, negotiation: NegotiationRow, guardianApprovedAt: Date | null, from: 'PROPOSED' | 'PENDING_GUARDIAN'): Promise<AcceptCastingDto> {
    const now = new Date();
    const contract = await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.castingOffer.updateMany({ where: { id: offer.id, status: from }, data: { status: 'ACCEPTED', respondedAt: now } });
      if (accepted.count === 0) throw new ConflictException('이미 처리된 제안입니다');
      const agreed = await tx.castingNegotiation.updateMany({ where: { id: negotiation.id, status: 'OPEN' }, data: { status: 'AGREED' } });
      if (agreed.count === 0) throw new ConflictException('끝난 캐스팅 협상입니다');
      const cast = await tx.castingRole.updateMany({ where: { id: negotiation.roleId, status: 'OPEN' }, data: { status: 'CAST' } });
      if (cast.count === 0) throw new ConflictException('이미 캐스팅이 끝난 배역입니다');

      await tx.castingOffer.updateMany({
        where: { negotiation: { roleId: negotiation.roleId, id: { not: negotiation.id } }, status: { in: ['PROPOSED', 'PENDING_GUARDIAN'] } },
        data: { status: 'WITHDRAWN', respondedAt: now },
      });
      await tx.castingNegotiation.updateMany({
        where: { roleId: negotiation.roleId, id: { not: negotiation.id }, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });

      const created = await tx.castingContract.create({
        data: {
          negotiationId: negotiation.id,
          offerId: offer.id,
          projectId: negotiation.role.projectId,
          roleId: negotiation.roleId,
          talentId: negotiation.talentId,
          feeType: offer.feeType,
          flatFeeKrw: offer.flatFeeKrw,
          perEpisodeFeeKrw: offer.perEpisodeFeeKrw,
          episodes: offer.episodes,
          revenueSharePct: offer.revenueSharePct,
          usage: offer.usage,
          contentTags: negotiation.role.contentTags,
          exclusive: offer.exclusive,
          requiresTalentApproval: offer.requiresTalentApproval,
          earlyTerminationPct: offer.earlyTerminationPct,
          guardianApprovedAt,
          startsAt: now,
          productionEndsAt: addDays(now, offer.productionDays),
          endsAt: addMonths(now, offer.termMonths),
        },
      });
      return tx.castingContract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE });
    });
    const accepted = await this.prisma.castingOffer.findUniqueOrThrow({ where: { id: offer.id } });
    return { status: 'CONTRACTED', offer: toOfferDto(accepted), contract: toContractDto(contract) };
  }

  // --- 출연 계약 ----------------------------------------------------------------

  async listContracts(user: CastingUser): Promise<CastingContractDto[]> {
    const rows = await this.prisma.castingContract.findMany({
      where: isAdmin(user) ? {} : this.contractVisibility(user.id),
      include: CONTRACT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toContractDto);
  }

  async getContract(user: CastingUser, contractId: string): Promise<CastingContractDto> {
    return toContractDto(await this.visibleContract(user, contractId));
  }

  /** 조기 종료 보상액 안내 (출연자·보호자) */
  async earlyTerminationQuote(user: CastingUser, contractId: string): Promise<EarlyTerminationQuoteDto> {
    const c = await this.visibleContract(user, contractId);
    if (c.talent.userId !== user.id && c.talent.guardianId !== user.id) throw new NotFoundException('계약을 찾을 수 없습니다');
    const works = await this.prisma.work.findMany({
      where: { appearances: { some: { contractId } }, status: { not: 'REMOVED' } },
      select: { id: true },
    });
    return { contractId, ...earlyTerminationAmount(c.flatFeeKrw, c.earlyTerminationPct), affectedWorkIds: works.map((w) => w.id) };
  }

  /** 관리자: 조기 종료 확정 (보상 입금 확인 후). 계약을 끝내고 이 계약으로 만든 작품을 내린다 */
  async terminate(contractId: string, reason: string): Promise<CastingContractDto> {
    const c = await this.prisma.castingContract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundException('계약을 찾을 수 없습니다');
    if (c.status !== 'ACTIVE') throw new ConflictException('진행 중인 계약이 아닙니다');
    await this.prisma.$transaction([
      this.prisma.castingContract.update({
        where: { id: contractId },
        data: { status: 'TERMINATED', terminatedAt: new Date(), terminationReason: reason.trim() },
      }),
      this.prisma.work.updateMany({ where: { appearances: { some: { contractId } }, status: { not: 'REMOVED' } }, data: { status: 'REMOVED' } }),
    ]);
    return toContractDto(await this.prisma.castingContract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
  }

  // --- helpers ----------------------------------------------------------------

  async memberProject(user: CastingUser, projectId: string, opts: { allowAdmin?: boolean } = {}): Promise<ProjectRow> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: PROJECT_INCLUDE });
    const allowed = project && (projectMemberIds(project).includes(user.id) || (opts.allowAdmin && isAdmin(user)));
    if (!allowed) throw new NotFoundException('작품을 찾을 수 없습니다');
    return project;
  }

  private contractVisibility(userId: string): Prisma.CastingContractWhereInput {
    return { OR: [{ talent: { userId } }, { talent: { guardianId: userId } }, { project: studioMemberWhere(userId) }] };
  }

  private async visibleContract(user: CastingUser, contractId: string): Promise<ContractRow> {
    const row = await this.prisma.castingContract.findFirst({
      where: { id: contractId, ...(isAdmin(user) ? {} : this.contractVisibility(user.id)) },
      include: CONTRACT_INCLUDE,
    });
    if (!row) throw new NotFoundException('계약을 찾을 수 없습니다');
    return row;
  }

  private async participating(user: CastingUser, negotiationId: string): Promise<{ negotiation: NegotiationRow; party: Party }> {
    const negotiation = await this.prisma.castingNegotiation.findUnique({ where: { id: negotiationId }, include: NEGOTIATION_INCLUDE });
    const party = negotiation && partyOf(user.id, negotiation);
    if (!negotiation || !party) throw new NotFoundException('캐스팅 협상을 찾을 수 없습니다');
    return { negotiation, party };
  }

  /** 지금 이 배역에 캐스팅할 수 있는가: 등록 완료, 장면 유형 모두 허용, 미성년자 제한 */
  private async assertFit(role: Pick<CastingRole, 'contentTags' | 'isMinorRole'>, talentId: string) {
    const check = await this.talent.castable(talentId);
    if (!check) throw new NotFoundException('출연자를 찾을 수 없습니다');
    if (!check.castable) throw new ConflictException('출연자 등록이 끝나지 않았거나 철회되었습니다');
    const notAllowed = missingTags(role.contentTags, check.profile.allowedTags);
    if (notAllowed.length) throw new ConflictException(`출연자가 허용하지 않은 장면 유형이 있습니다: ${notAllowed.join(', ')}`);
    if (check.isMinor) {
      const banned = minorTagViolations(role.contentTags);
      if (banned.length) throw new ConflictException(`미성년자는 출연할 수 없는 장면 유형입니다: ${banned.join(', ')}`);
    }
    return check;
  }

  private async toNegotiationDto(n: NegotiationRow, viewerId: string): Promise<CastingNegotiationDto> {
    const check = await this.talent.castable(n.talentId);
    const party = partyOf(viewerId, n);
    return {
      id: n.id,
      roleId: n.roleId,
      roleName: n.role.name,
      roleContentTags: n.role.contentTags,
      projectId: n.role.projectId,
      projectTitle: n.role.project.title,
      talentId: n.talentId,
      talentStageName: n.talent.stageName,
      talentIsMinor: check?.isMinor ?? false,
      initiatedBy: n.initiatedBy,
      message: n.message,
      status: n.status,
      viewerSide: party?.isGuardian ? 'GUARDIAN' : (party?.side ?? 'STUDIO'),
      contractId: n.contract?.id ?? null,
      offers: n.offers.map(toOfferDto),
      createdAt: n.createdAt,
    };
  }
}
