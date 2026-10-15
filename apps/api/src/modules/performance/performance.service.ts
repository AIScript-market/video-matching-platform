import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import type { WorkPerformanceSnapshot } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { projectMemberIds } from '../casting/casting.service.js';
import type { PerformanceSnapshotDto, RecordPerformanceDto, TrainingRowDto } from './performance.dto.js';

/** AuthUser 또는 Viewer (역할은 문자열 목록) */
type PerfUser = Pick<AuthUser, 'id'> & { roles: readonly string[] };
const isAdmin = (u: PerfUser) => u.roles.includes('ADMIN');
const DAY_MS = 86_400_000;

function toDto(s: WorkPerformanceSnapshot): PerformanceSnapshotDto {
  return {
    id: s.id,
    workId: s.workId,
    capturedAt: s.capturedAt,
    views: s.views,
    watchTimeMinutes: s.watchTimeMinutes,
    avgViewDurationSec: s.avgViewDurationSec,
    likes: s.likes,
    comments: s.comments,
    positiveComments: s.positiveComments,
    channelSubscribers: s.channelSubscribers,
    subscribersGained: s.subscribersGained,
    revenueKrw: s.revenueKrw,
    source: s.source,
    createdAt: s.createdAt,
  };
}

/**
 * 작품 성과 기록과 학습용 데이터. 흥행 판단 모델의 정답 데이터를 모으는 자리다 (docs/hit-model.md).
 * 지금은 기획사·관리자가 직접 입력하고, 채널을 직접 운영하게 되면 유튜브 분석 API로 채운다.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 기록: 작품의 기획사 구성원 또는 관리자. 공개된 적이 있는 작품만 */
  async record(user: PerfUser, workId: string, dto: RecordPerformanceDto): Promise<PerformanceSnapshotDto> {
    const work = await this.loadWork(workId);
    if (!isAdmin(user) && !projectMemberIds(work.project).includes(user.id)) throw new NotFoundException('작품을 찾을 수 없습니다');
    if (!work.publishedAt) throw new ConflictException('공개한 작품만 성과를 기록할 수 있습니다');
    const row = await this.prisma.workPerformanceSnapshot.create({
      data: {
        workId,
        capturedAt: dto.capturedAt,
        views: dto.views,
        watchTimeMinutes: dto.watchTimeMinutes ?? null,
        avgViewDurationSec: dto.avgViewDurationSec ?? null,
        likes: dto.likes ?? null,
        comments: dto.comments ?? null,
        positiveComments: dto.positiveComments ?? null,
        channelSubscribers: dto.channelSubscribers ?? null,
        subscribersGained: dto.subscribersGained ?? null,
        revenueKrw: dto.revenueKrw ?? null,
        recordedById: user.id,
      },
    });
    return toDto(row);
  }

  /** 조회: 기획사 구성원, 출연자·보호자, 관리자 */
  async list(user: PerfUser, workId: string): Promise<PerformanceSnapshotDto[]> {
    const work = await this.loadWork(workId);
    const appears = work.appearances.some((a) => a.contract.talent.userId === user.id || a.contract.talent.guardianId === user.id);
    if (!isAdmin(user) && !projectMemberIds(work.project).includes(user.id) && !appears) throw new NotFoundException('작품을 찾을 수 없습니다');
    const rows = await this.prisma.workPerformanceSnapshot.findMany({ where: { workId }, orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }] });
    return rows.map(toDto);
  }

  /**
   * 관리자: 학습용 데이터. 작가가 분석·학습에 동의한 대본만, 대본 원문 없이
   * 메타데이터와 그 대본으로 만든 작품의 최근 성과(정답)를 묶는다. 벡터는 ML 서비스가 DB에서 직접 읽는다.
   */
  async trainingSet(): Promise<TrainingRowDto[]> {
    const scripts = await this.prisma.script.findMany({
      where: { trainingConsent: true, author: { status: 'ACTIVE' } },
      select: {
        id: true,
        genre: true,
        aiSummary: true,
        fullText: true,
        negotiations: {
          select: {
            deal: {
              select: {
                project: {
                  select: {
                    works: {
                      where: { publishedAt: { not: null } },
                      select: {
                        id: true,
                        publishedAt: true,
                        performances: { orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }], take: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return scripts.map((s) => {
      const summary = s.aiSummary as { contentRating?: string } | null;
      const works = s.negotiations.flatMap((n) => n.deal?.project?.works ?? []);
      return {
        scriptId: s.id,
        genre: s.genre,
        contentRating: summary?.contentRating ?? null,
        fullTextChars: s.fullText.length,
        works: works.map((w) => {
          const latest = w.performances[0] ?? null;
          return {
            workId: w.id,
            publishedAt: w.publishedAt,
            latest: latest && toDto(latest),
            daysSincePublish: latest && w.publishedAt ? Math.floor((latest.capturedAt.getTime() - w.publishedAt.getTime()) / DAY_MS) : null,
          };
        }),
      };
    });
  }

  private async loadWork(workId: string) {
    const work = await this.prisma.work.findUnique({
      where: { id: workId },
      select: {
        publishedAt: true,
        project: { select: { deal: { select: { negotiation: { select: { writerId: true, producerId: true } } } } } },
        appearances: { select: { contract: { select: { talent: { select: { userId: true, guardianId: true } } } } } },
      },
    });
    if (!work) throw new NotFoundException('작품을 찾을 수 없습니다');
    return work;
  }
}
