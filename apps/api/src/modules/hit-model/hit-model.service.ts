import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { canSeeScript, type Viewer } from '../access/access-rules.js';
import type {
  CommentSentimentDto,
  EmbedStaleResultDto,
  HitInsightDto,
  HitModelVersionDto,
  MlStatusDto,
  RecommendationsDto,
  SimilarWorkDto,
  TrainResultDto,
} from './hit-model.dto.js';
import { MlClient, type MlNeighbor } from './ml.client.js';

/** 추천 후보로 넘기는 최대 대본 수 (최근 공개 순) */
const CANDIDATE_LIMIT = 2000;

/**
 * 흥행 판단 모델 결과를 영상 제작자에게 보여 준다 (docs/hit-model.md).
 * 작가 본인에게는 보여 주지 않는다. 점수에 맞춰 쓰기 시작하면 대본이 뻔해지고 모델도 의미를 잃는다.
 */
@Injectable()
export class HitModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
  ) {}

  async insight(viewer: Viewer, scriptId: string): Promise<HitInsightDto> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      select: { authorId: true, status: true, author: { select: { status: true } } },
    });
    if (!script || !canSeeScript({ ...script, authorStatus: script.author.status }, viewer)) {
      throw new NotFoundException('대본을 찾을 수 없습니다');
    }
    if (script.authorId === viewer.id && !viewer.roles.includes('ADMIN')) {
      throw new ForbiddenException('작가 본인에게는 흥행 판단 결과를 보여 주지 않습니다');
    }
    const p = await this.ml.predict(scriptId);
    return {
      scriptId,
      mode: p.mode,
      embedder: p.embedder,
      trainingPairs: p.trainingPairs,
      requiredPairs: p.requiredPairs,
      modelVersion: p.modelVersion,
      probability: p.probability,
      low: p.low,
      high: p.high,
      neighborSignal: p.neighborSignal,
      neighbors: await this.describeNeighbors(p.neighbors ?? []),
    };
  }

  /** 영상 제작자용 추천: 공개 대본 중 자기 대본을 뺀 후보를 모델 순서로 */
  async recommendations(viewer: Viewer, limit = 20): Promise<RecommendationsDto> {
    const candidates = await this.prisma.script.findMany({
      where: { status: 'PUBLISHED', author: { status: 'ACTIVE' }, authorId: { not: viewer.id } },
      select: { id: true, title: true, logline: true, genre: true, author: { select: { displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const ranking = await this.ml.rank(
      candidates.map((c) => c.id),
      limit,
    );
    const neighbors = await this.describeNeighbors(ranking.items.flatMap((i) => i.neighbors ?? []));
    const neighborFor = (n: MlNeighbor) => neighbors.find((d) => d.scriptId === n.scriptId)!;
    const items = ranking.items
      .filter((i) => byId.has(i.scriptId))
      .map((i) => {
        const s = byId.get(i.scriptId)!;
        return {
          id: s.id,
          title: s.title,
          logline: s.logline,
          genre: s.genre,
          authorName: s.author.displayName,
          score: i.score,
          probability: i.probability,
          low: i.low,
          high: i.high,
          neighbors: (i.neighbors ?? []).map(neighborFor),
        };
      });
    return {
      mode: ranking.mode,
      embedder: ranking.embedder,
      trainingPairs: ranking.trainingPairs,
      requiredPairs: ranking.requiredPairs,
      modelVersion: ranking.modelVersion,
      items,
    };
  }

  sentiment(comments: string[]): Promise<CommentSentimentDto> {
    return this.ml.sentiment(comments);
  }

  status(): Promise<MlStatusDto> {
    return this.ml.status();
  }

  train(forceActivate: boolean): Promise<TrainResultDto> {
    return this.ml.train(forceActivate);
  }

  embedStale(): Promise<EmbedStaleResultDto> {
    return this.ml.embedStale();
  }

  async models(): Promise<HitModelVersionDto[]> {
    const rows = await this.prisma.hitModelVersion.findMany({ orderBy: { trainedAt: 'desc' }, take: 20 });
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      embedder: r.embedder,
      algorithm: r.algorithm,
      labelDefinition: r.labelDefinition,
      trainingPairs: r.trainingPairs,
      metrics: r.metrics as Record<string, unknown>,
      active: r.active,
      trainedAt: r.trainedAt,
    }));
  }

  /** 비슷한 작품에 제목을 붙인다. 지금 공개 상태가 아닌 대본은 제목을 가리고 작품 제목만 보인다 */
  private async describeNeighbors(neighbors: MlNeighbor[]): Promise<SimilarWorkDto[]> {
    if (neighbors.length === 0) return [];
    const rows = await this.prisma.script.findMany({
      where: { id: { in: [...new Set(neighbors.map((n) => n.scriptId))] } },
      select: {
        id: true,
        title: true,
        status: true,
        negotiations: {
          select: {
            deal: {
              select: {
                project: {
                  select: { works: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: 'asc' }, take: 1, select: { title: true } } },
                },
              },
            },
          },
        },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return neighbors.map((n) => {
      const row = byId.get(n.scriptId);
      const workTitle = row?.negotiations.flatMap((x) => x.deal?.project?.works ?? [])[0]?.title ?? null;
      return {
        scriptId: n.scriptId,
        title: row?.status === 'PUBLISHED' ? row.title : '비공개 대본',
        workTitle,
        similarity: n.similarity,
        hit: n.hit,
        percentile: n.percentile,
      };
    });
  }
}
