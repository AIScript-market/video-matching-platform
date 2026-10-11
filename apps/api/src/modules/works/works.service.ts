import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CastingService, projectMemberIds, studioMemberWhere } from '../casting/casting.service.js';
import {
  addDays,
  AUTO_UNLIST_REASONS,
  isMinorAt,
  minorTagViolations,
  missingTags,
  TAKEDOWN_REVIEW_DAYS,
  type ContentTag,
} from '../talent/likeness-policy.js';
import type { CreateTakedownDto, CreateWorkDto, PublishWorkDto, TakedownDto, WorkDto } from './works.dto.js';

type WorksUser = Pick<AuthUser, 'id' | 'roles'>;

const isAdmin = (u: WorksUser) => u.roles.includes('ADMIN');

const WORK_INCLUDE = {
  project: { select: { title: true, deal: { select: { negotiation: { select: { writerId: true, producerId: true } } } } } },
  appearances: {
    include: {
      contract: {
        include: {
          role: { select: { name: true } },
          talent: { select: { id: true, stageName: true, userId: true, guardianId: true, user: { select: { identity: true } } } },
        },
      },
    },
  },
} satisfies Prisma.WorkInclude;
type WorkRow = Prisma.WorkGetPayload<{ include: typeof WORK_INCLUDE }>;
type AppearanceRow = WorkRow['appearances'][number];

function toWorkDto(w: WorkRow): WorkDto {
  return {
    id: w.id,
    projectId: w.projectId,
    projectTitle: w.project.title,
    title: w.title,
    contentTags: w.contentTags,
    aiGenerated: w.aiGenerated,
    externalUrl: w.externalUrl,
    status: w.status,
    publishedAt: w.publishedAt,
    appearances: w.appearances.map((a) => ({
      contractId: a.contractId,
      talentId: a.contract.talent.id,
      talentStageName: a.contract.talent.stageName,
      roleName: a.contract.role.name,
      requiresApproval: a.contract.requiresTalentApproval,
      approvedAt: a.approvedAt,
    })),
    createdAt: w.createdAt,
  };
}

const TAKEDOWN_INCLUDE = { work: { select: { title: true } } } satisfies Prisma.TakedownRequestInclude;

function toTakedownDto(t: Prisma.TakedownRequestGetPayload<{ include: typeof TAKEDOWN_INCLUDE }>): TakedownDto {
  return {
    id: t.id,
    workId: t.workId,
    workTitle: t.work.title,
    requesterId: t.requesterId,
    reason: t.reason,
    details: t.details,
    interimUnlisted: t.interimUnlisted,
    status: t.status,
    reviewDueAt: t.reviewDueAt,
    resolution: t.resolution,
    decidedAt: t.decidedAt,
    createdAt: t.createdAt,
  };
}

const appearsAs = (a: AppearanceRow, userId: string) => a.contract.talent.userId === userId || a.contract.talent.guardianId === userId;

function minorNow(a: AppearanceRow, now: Date): boolean {
  const identity = a.contract.talent.user.identity;
  return identity ? isMinorAt(identity, now) : false;
}

/**
 * 작품이 출연 계약 하나를 어기는 점들 (정책 4장, 5장). 비어 있으면 그 출연분은 공개할 수 있다.
 */
export function appearanceProblems(
  work: { contentTags: ContentTag[]; createdAt: Date },
  a: AppearanceRow,
  now: Date,
  { requireApproval }: { requireApproval: boolean },
): string[] {
  const c = a.contract;
  const who = c.talent.stageName;
  const problems: string[] = [];
  if (c.status !== 'ACTIVE' || c.endsAt <= now) problems.push(`${who}: 계약이 진행 중이 아닙니다`);
  if (work.createdAt > c.productionEndsAt) problems.push(`${who}: 제작 기한이 지난 뒤에 만든 작품입니다`);
  const outOfScope = missingTags(work.contentTags, c.contentTags);
  if (outOfScope.length) problems.push(`${who}: 계약에 없는 장면 유형이 있습니다 (${outOfScope.join(', ')})`);
  if (minorNow(a, now)) {
    const banned = minorTagViolations(work.contentTags);
    if (banned.length) problems.push(`${who}: 미성년자에게 허용되지 않는 장면 유형입니다 (${banned.join(', ')})`);
  }
  if (requireApproval && c.requiresTalentApproval && !a.approvedAt) problems.push(`${who}: 출연분 확인을 기다리는 중입니다`);
  return problems;
}

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casting: CastingService,
  ) {}

  async create(user: WorksUser, projectId: string, dto: CreateWorkDto): Promise<WorkDto> {
    await this.casting.memberProject(user, projectId);
    const contracts = await this.prisma.castingContract.findMany({ where: { id: { in: dto.contractIds }, projectId }, select: { id: true } });
    if (contracts.length !== dto.contractIds.length) throw new BadRequestException('이 작품의 출연 계약만 넣을 수 있습니다');
    const now = new Date();
    const row = await this.prisma.work.create({
      data: {
        projectId,
        title: dto.title.trim(),
        contentTags: dto.contentTags,
        aiGenerated: dto.aiGenerated ?? true,
        appearances: { create: dto.contractIds.map((contractId) => ({ contractId })) },
      },
      include: WORK_INCLUDE,
    });
    // 공개와 같은 규칙(확인권 제외)을 등록 때도 검사해 초안 단계에서 문제를 알려 준다
    const problems = row.appearances.flatMap((a) => appearanceProblems(row, a, now, { requireApproval: false }));
    if (problems.length) {
      await this.prisma.work.delete({ where: { id: row.id } });
      throw new ConflictException(problems);
    }
    return toWorkDto(row);
  }

  async listForProject(user: WorksUser, projectId: string): Promise<WorkDto[]> {
    await this.casting.memberProject(user, projectId, { allowAdmin: true });
    const rows = await this.prisma.work.findMany({ where: { projectId }, include: WORK_INCLUDE, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map(toWorkDto);
  }

  /** 내가 출연한(보호자면 대리하는 출연자가 출연한) 작품 */
  async listMine(user: WorksUser): Promise<WorkDto[]> {
    const rows = await this.prisma.work.findMany({
      where: { appearances: { some: { contract: { talent: { OR: [{ userId: user.id }, { guardianId: user.id }] } } } } },
      include: WORK_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toWorkDto);
  }

  async get(user: WorksUser, workId: string): Promise<WorkDto> {
    const work = await this.load(workId);
    if (!this.canSee(user, work)) throw new NotFoundException('작품을 찾을 수 없습니다');
    return toWorkDto(work);
  }

  /** 출연분 확인. 미성년자는 보호자가 확인한다 */
  async approve(user: WorksUser, workId: string): Promise<WorkDto> {
    const work = await this.load(workId);
    const now = new Date();
    const mine = work.appearances.filter((a) => appearsAs(a, user.id));
    if (!mine.length) throw new NotFoundException('작품을 찾을 수 없습니다');
    if (work.status !== 'DRAFT') throw new ConflictException('공개 전 작품만 확인할 수 있습니다');
    for (const a of mine) {
      if (minorNow(a, now) && a.contract.talent.guardianId !== user.id) {
        throw new ForbiddenException('미성년 출연자의 출연분은 보호자가 확인해야 합니다');
      }
    }
    await this.prisma.workAppearance.updateMany({
      where: { workId, contractId: { in: mine.map((a) => a.contractId) } },
      data: { approvedAt: now },
    });
    return toWorkDto(await this.load(workId));
  }

  /** 공개. 계약·장면 유형·출연분 확인·제작 기한·AI 표시를 모두 통과해야 한다 */
  async publish(user: WorksUser, workId: string, dto: PublishWorkDto): Promise<WorkDto> {
    const work = await this.load(workId);
    if (!projectMemberIds(work.project).includes(user.id)) throw new NotFoundException('작품을 찾을 수 없습니다');
    if (work.status !== 'DRAFT') throw new ConflictException('공개 전 작품만 공개할 수 있습니다');
    if (work.aiGenerated && !dto.syntheticLabelApplied) {
      throw new BadRequestException('AI로 만든 초상을 쓴 작품은 합성 콘텐츠 표시를 한 뒤에 공개할 수 있습니다');
    }
    const now = new Date();
    const problems = work.appearances.flatMap((a) => appearanceProblems(work, a, now, { requireApproval: true }));
    if (problems.length) throw new ConflictException(problems);
    await this.prisma.work.update({ where: { id: workId }, data: { status: 'PUBLISHED', publishedAt: now, externalUrl: dto.externalUrl } });
    return toWorkDto(await this.load(workId));
  }

  /** 내림 요청. 계약 위반 사유(5장)는 즉시 비공개, 변심·인격권(6장)은 공개 유지하고 협의 */
  async requestTakedown(user: WorksUser, workId: string, dto: CreateTakedownDto): Promise<TakedownDto> {
    const work = await this.load(workId);
    if (!work.appearances.some((a) => appearsAs(a, user.id)) && !isAdmin(user)) throw new NotFoundException('작품을 찾을 수 없습니다');
    if (work.status === 'REMOVED') throw new ConflictException('이미 내려간 작품입니다');

    const now = new Date();
    const severe = AUTO_UNLIST_REASONS.includes(dto.reason);
    const unlist = severe && work.status === 'PUBLISHED';
    const [request] = await this.prisma.$transaction([
      this.prisma.takedownRequest.create({
        data: {
          workId,
          requesterId: user.id,
          reason: dto.reason,
          details: dto.details.trim(),
          interimUnlisted: unlist,
          reviewDueAt: severe ? addDays(now, TAKEDOWN_REVIEW_DAYS) : null,
        },
        include: TAKEDOWN_INCLUDE,
      }),
      ...(unlist ? [this.prisma.work.update({ where: { id: workId }, data: { status: 'UNLISTED' } })] : []),
    ]);
    return toTakedownDto(request);
  }

  async listTakedowns(user: WorksUser): Promise<TakedownDto[]> {
    const where: Prisma.TakedownRequestWhereInput = isAdmin(user)
      ? { status: 'OPEN' }
      : { OR: [{ requesterId: user.id }, { work: { project: studioMemberWhere(user.id) } }] };
    const rows = await this.prisma.takedownRequest.findMany({ where, include: TAKEDOWN_INCLUDE, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map(toTakedownDto);
  }

  /** 관리자 판단. 인정하면 삭제, 기각하면 자동 비공개였던 작품을 다시 공개한다 */
  async decide(admin: WorksUser, takedownId: string, uphold: boolean, resolution: string): Promise<TakedownDto> {
    const request = await this.prisma.takedownRequest.findUnique({ where: { id: takedownId } });
    if (!request) throw new NotFoundException('내림 요청을 찾을 수 없습니다');
    if (request.status !== 'OPEN') throw new ConflictException('이미 처리된 요청입니다');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.takedownRequest.update({
        where: { id: takedownId },
        data: { status: uphold ? 'UPHELD' : 'REJECTED', decidedById: admin.id, decidedAt: now, resolution: resolution.trim() },
      });
      if (uphold) {
        await tx.work.update({ where: { id: request.workId }, data: { status: 'REMOVED' } });
        return;
      }
      const stillHolding = await tx.takedownRequest.count({ where: { workId: request.workId, status: 'OPEN', interimUnlisted: true } });
      if (request.interimUnlisted && stillHolding === 0) {
        await tx.work.updateMany({ where: { id: request.workId, status: 'UNLISTED' }, data: { status: 'PUBLISHED' } });
      }
    });
    return toTakedownDto(await this.prisma.takedownRequest.findUniqueOrThrow({ where: { id: takedownId }, include: TAKEDOWN_INCLUDE }));
  }

  /** 기획사가 요청을 받아들여 작품을 내린다 (합의) */
  async settle(user: WorksUser, takedownId: string, resolution: string): Promise<TakedownDto> {
    const request = await this.prisma.takedownRequest.findUnique({ where: { id: takedownId }, include: { work: { include: WORK_INCLUDE } } });
    if (!request || !projectMemberIds(request.work.project).includes(user.id)) throw new NotFoundException('내림 요청을 찾을 수 없습니다');
    if (request.status !== 'OPEN') throw new ConflictException('이미 처리된 요청입니다');
    await this.prisma.$transaction([
      this.prisma.takedownRequest.update({
        where: { id: takedownId },
        data: { status: 'SETTLED', decidedById: user.id, decidedAt: new Date(), resolution: resolution.trim() },
      }),
      this.prisma.work.update({ where: { id: request.workId }, data: { status: 'REMOVED' } }),
    ]);
    return toTakedownDto(await this.prisma.takedownRequest.findUniqueOrThrow({ where: { id: takedownId }, include: TAKEDOWN_INCLUDE }));
  }

  private canSee(user: WorksUser, work: WorkRow): boolean {
    return isAdmin(user) || projectMemberIds(work.project).includes(user.id) || work.appearances.some((a) => appearsAs(a, user.id));
  }

  private async load(workId: string): Promise<WorkRow> {
    const work = await this.prisma.work.findUnique({ where: { id: workId }, include: WORK_INCLUDE });
    if (!work) throw new NotFoundException('작품을 찾을 수 없습니다');
    return work;
  }
}
