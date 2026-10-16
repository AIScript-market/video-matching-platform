import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  canReadFullText,
  canReadPreview,
  canSeeScript,
  type Viewer,
} from '../access/access-rules.js';
import { AiJobsQueue } from './ai-jobs.queue.js';
import { extractScriptText } from './script-file.js';
import {
  PREVIEW_MAX,
  type CreateScriptDto,
  type ListScriptsQueryDto,
  type PublishScriptDto,
  type ScriptDetailDto,
  type ScriptListDto,
  type ScriptSummaryDto,
  type UpdateScriptDto,
} from './dto/script.dto.js';

/** 목록·상세에서 공통으로 내보내는 공개 필드 (fullText·previewText 제외) */
const PUBLIC_SELECT = {
  id: true,
  title: true,
  logline: true,
  synopsis: true,
  genre: true,
  status: true,
  aiSummary: true,
  aiSummaryRequestedAt: true,
  aiSummaryConsent: true,
  contentUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, displayName: true, status: true } },
} as const;

/** 내용 필드. 바뀌면 최근 수정 시각을 갱신한다 */
const CONTENT_FIELDS = ['title', 'logline', 'synopsis', 'genre', 'fullText'] as const;
/**
 * AI 요약에 쓰는 필드: 작가가 공개하려고 쓴 소개 글만. 대본 전문·미리보기는 요약기로 보내지 않는다
 * (apps/worker db.ts가 읽지도 않는다). 그래서 요약은 시놉시스처럼 누구나 본다.
 */
const SUMMARY_FIELDS = ['title', 'logline', 'synopsis', 'genre'] as const;

/** 요약할 수 있는가: 작가가 동의했고 요약할 소개 글이 있다 */
const canSummarize = (s: { aiSummaryConsent: boolean; logline: string; synopsis: string }) =>
  s.aiSummaryConsent && Boolean(s.logline.trim() || s.synopsis.trim());

type Tx = Prisma.TransactionClient;

export const VIEW_LOG_WINDOW_MS = 10 * 60 * 1000;
/** 작성자가 요약 새로고침을 연달아 누를 때 같은 요청이 진행 중이면 이 시간 안에는 다시 받지 않는다 */
export const SUMMARY_REFRESH_COOLDOWN_MS = 30 * 1000;

export interface UploadedScriptFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

type SummaryState = { aiSummary: unknown; aiSummaryRequestedAt: Date | null };

/** 요청 시각이 마지막 요약 생성 시각보다 나중이면 새 요약을 만드는 중 */
export function isSummaryPending({ aiSummary, aiSummaryRequestedAt }: SummaryState): boolean {
  if (!aiSummaryRequestedAt) return false;
  const generatedAt = (aiSummary as { generatedAt?: string } | null)?.generatedAt;
  if (!generatedAt) return true;
  return aiSummaryRequestedAt.getTime() > new Date(generatedAt).getTime();
}

function withPending<T extends SummaryState>(row: T): T & { aiSummaryPending: boolean } {
  return { ...row, aiSummaryPending: isSummaryPending(row) };
}

/** 응답에서 작가 상태(내부용)를 뺀다 */
function publicShape<T extends { author: { id: string; displayName: string; status: string } }>(row: T) {
  const { status: _status, ...author } = row.author;
  return { ...row, author };
}

const cleanPreview = (text: string | undefined | null) => {
  const trimmed = text?.replace(/\r\n?/g, '\n').trim();
  return trimmed ? trimmed : null;
};

@Injectable()
export class ScriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiJobs: AiJobsQueue,
    private readonly wallet: WalletService,
  ) {}

  async create(user: Viewer, dto: CreateScriptDto): Promise<ScriptDetailDto> {
    const declared = dto.rightsDeclared === true;
    const script = await this.prisma.script.create({
      data: {
        authorId: user.id,
        title: dto.title.trim(),
        logline: dto.logline.trim(),
        synopsis: dto.synopsis,
        genre: dto.genre.trim(),
        fullText: dto.fullText,
        previewText: cleanPreview(dto.previewText),
        status: 'DRAFT',
        rightsDeclared: declared,
        rightsDeclaredAt: declared ? new Date() : null,
        trainingConsent: dto.trainingConsent === true,
        trainingConsentAt: dto.trainingConsent === true ? new Date() : null,
        aiSummaryConsent: dto.aiSummaryConsent === true,
        aiSummaryConsentAt: dto.aiSummaryConsent === true ? new Date() : null,
      },
    });
    if (canSummarize(script)) await this.requestSummary(script.id);
    return this.get(script.id, user);
  }

  async list(query: ListScriptsQueryDto, viewer: Viewer | null): Promise<ScriptListDto> {
    if (query.mine && !viewer) throw new ForbiddenException('로그인이 필요합니다');
    const take = query.take ?? 20;
    const where = {
      // 공개 목록에는 정지·탈퇴한 작가의 대본을 내보내지 않는다
      ...(query.mine
        ? { authorId: viewer!.id }
        : { status: 'PUBLISHED' as const, author: { status: 'ACTIVE' as const } }),
      ...(query.genre ? { genre: query.genre } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { logline: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.script.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map((r) => publicShape(withPending(r))) as unknown as ScriptSummaryDto[];
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  /**
   * 상세. fullText는 작가와 열람 승인된 제작자에게만 주고, 제작자가 볼 때는 열람 로그를 남긴다.
   * previewText는 작가와 공개 대본을 보는 영상 제작자에게 준다.
   */
  async get(id: string, viewer: Viewer | null): Promise<ScriptDetailDto> {
    const script = await this.prisma.script.findUnique({
      where: { id },
      select: { ...PUBLIC_SELECT, authorId: true, rightsDeclared: true, rightsDeclaredAt: true, trainingConsent: true },
    });
    if (!script || !canSeeScript({ ...script, authorStatus: script.author.status }, viewer)) {
      throw new NotFoundException('대본을 찾을 수 없습니다');
    }

    const isAuthor = viewer?.id === script.authorId;
    const [access, unlock] =
      viewer && !isAuthor
        ? await Promise.all([
            this.prisma.scriptAccessRequest.findUnique({
              where: { scriptId_producerId: { scriptId: id, producerId: viewer.id } },
              select: { status: true },
            }),
            this.prisma.scriptPreviewUnlock.findUnique({
              where: { scriptId_userId: { scriptId: id, userId: viewer.id } },
              select: { id: true },
            }),
          ])
        : [null, null];
    const accessStatus = access?.status ?? null;
    const full = canReadFullText(script, viewer, accessStatus);
    const preview = canReadPreview(script, viewer, Boolean(unlock));

    const texts = await this.prisma.script.findUniqueOrThrow({
      where: { id },
      select: { fullText: full, previewText: true },
    });
    if (full && !isAuthor) await this.logView(id, viewer!.id);

    const { authorId: _authorId, ...rest } = script;
    return {
      ...publicShape(withPending(rest)),
      fullText: full ? texts.fullText : null,
      previewText: preview ? (texts.previewText ?? null) : null,
      previewAvailable: Boolean(texts.previewText),
      viewer: {
        isAuthor,
        accessRequestStatus: accessStatus,
        canReadFullText: full,
        canReadPreview: preview,
        previewUnlocked: Boolean(unlock),
      },
    } as unknown as ScriptDetailDto;
  }

  /** 미리보기 열람권 구매 (코인). 이미 샀거나 작가 본인이면 그대로 반환 */
  async unlockPreview(id: string, viewer: Viewer): Promise<ScriptDetailDto> {
    const script = await this.prisma.script.findUnique({
      where: { id },
      select: { authorId: true, status: true, previewText: true, author: { select: { status: true } } },
    });
    if (!script || !canSeeScript({ ...script, authorStatus: script.author.status }, viewer)) {
      throw new NotFoundException('대본을 찾을 수 없습니다');
    }
    if (script.authorId === viewer.id) return this.get(id, viewer);
    if (script.status !== 'PUBLISHED' || !script.previewText) {
      throw new BadRequestException('이 대본에는 미리보기가 없습니다');
    }
    const existing = await this.prisma.scriptPreviewUnlock.findUnique({
      where: { scriptId_userId: { scriptId: id, userId: viewer.id } },
    });
    if (!existing) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.scriptPreviewUnlock.create({ data: { scriptId: id, userId: viewer.id } });
          await this.wallet.spend(tx, viewer.id, 'PREVIEW_UNLOCK', id);
        });
      } catch (err) {
        // 동시에 두 번 눌러 열람권이 이미 생겼으면 (unique 충돌) 한 번만 차감된 것이므로 그대로 진행
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    return this.get(id, viewer);
  }

  async update(id: string, user: Viewer, dto: UpdateScriptDto): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    if (dto.rightsDeclared === false && script.status === 'PUBLISHED') {
      throw new BadRequestException('공개 중인 대본은 권리 보유 진술을 철회할 수 없습니다');
    }
    const next = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.logline !== undefined && { logline: dto.logline.trim() }),
      ...(dto.synopsis !== undefined && { synopsis: dto.synopsis }),
      ...(dto.genre !== undefined && { genre: dto.genre.trim() }),
      ...(dto.fullText !== undefined && { fullText: dto.fullText }),
    };
    const contentChanged = CONTENT_FIELDS.some((f) => f in next && next[f] !== script[f]);
    const summaryChanged = SUMMARY_FIELDS.some((f) => f in next && next[f] !== script[f]);
    const consentOn = dto.aiSummaryConsent === true && !script.aiSummaryConsent;
    const consentOff = dto.aiSummaryConsent === false && script.aiSummaryConsent;
    const preview = dto.previewText !== undefined ? cleanPreview(dto.previewText) : undefined;
    const previewChanged = preview !== undefined && preview !== script.previewText;

    await this.prisma.script.update({
      where: { id },
      data: {
        ...next,
        ...(previewChanged && { previewText: preview }),
        ...((contentChanged || previewChanged) && { contentUpdatedAt: new Date() }),
        ...(dto.rightsDeclared === true &&
          !script.rightsDeclared && { rightsDeclared: true, rightsDeclaredAt: new Date() }),
        ...(dto.rightsDeclared === false && { rightsDeclared: false, rightsDeclaredAt: null }),
        ...(dto.trainingConsent !== undefined &&
          dto.trainingConsent !== script.trainingConsent && {
            trainingConsent: dto.trainingConsent,
            trainingConsentAt: dto.trainingConsent ? new Date() : null,
          }),
        ...(consentOn && { aiSummaryConsent: true, aiSummaryConsentAt: new Date() }),
        // 동의를 끄면 만든 요약도 지운다 (진행 중인 작업은 워커가 동의를 다시 보고 버린다)
        ...(consentOff && {
          aiSummaryConsent: false,
          aiSummaryConsentAt: null,
          aiSummary: Prisma.DbNull,
          aiSummaryRequestedAt: null,
        }),
      },
    });
    const after = { ...script, ...next, aiSummaryConsent: consentOn || (script.aiSummaryConsent && !consentOff) };
    if (canSummarize(after) && (summaryChanged || (consentOn && !script.aiSummary))) await this.requestSummary(id);
    return this.get(id, user);
  }

  /** 작성자가 AI 요약을 직접 다시 만든다 */
  async refreshSummary(id: string, user: Viewer): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    if (!script.aiSummaryConsent) throw new BadRequestException('AI 요약 만들기에 동의해야 요약을 만들 수 있습니다');
    if (!canSummarize(script)) throw new BadRequestException('요약할 로그라인이나 시놉시스를 먼저 써 주세요');
    const recent =
      script.aiSummaryRequestedAt &&
      Date.now() - script.aiSummaryRequestedAt.getTime() < SUMMARY_REFRESH_COOLDOWN_MS;
    if (recent && isSummaryPending(script)) {
      throw new HttpException('요약을 이미 만드는 중입니다. 잠시 후 다시 시도하세요', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await this.requestSummary(id))) {
      throw new HttpException('요약 작업을 등록하지 못했습니다. 잠시 후 다시 시도하세요', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.get(id, user);
  }

  /** 파일을 올려 새 초안(DRAFT)을 만든다. 제목은 파일 이름, 로그라인·시놉시스는 비워 둔다 */
  async createFromUpload(user: Viewer, file: UploadedScriptFile): Promise<ScriptDetailDto> {
    // 본문 추출에 실패하면 코인을 쓰지 않는다
    const { text, suggestedTitle } = await extractScriptText(file);
    const script = await this.prisma.$transaction(async (tx) => {
      const created = await tx.script.create({
        data: {
          authorId: user.id,
          title: suggestedTitle,
          logline: '',
          synopsis: '',
          genre: '미정',
          fullText: text,
          status: 'DRAFT',
        },
      });
      await this.wallet.spend(tx, user.id, 'SCRIPT_UPLOAD', created.id);
      await this.logUpload(tx, created.id, user.id, file, text, 'FULL');
      return created;
    });
    // 파일로 만든 초안은 시놉시스가 비어 있고 요약 동의도 아직 받지 않았으므로 요약하지 않는다 (편집 화면에서 쓰고 동의하면 만든다)
    return this.get(script.id, user);
  }

  /** 기존 대본의 본문을 업로드한 파일 내용으로 바꾼다 */
  async replaceFromUpload(id: string, user: Viewer, file: UploadedScriptFile): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    const { text } = await extractScriptText(file);
    const changed = text !== script.fullText;
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.spend(tx, user.id, 'SCRIPT_UPLOAD', id);
      await tx.script.update({
        where: { id },
        data: { fullText: text, ...(changed && { contentUpdatedAt: new Date() }) },
      });
      await this.logUpload(tx, id, user.id, file, text, 'FULL');
    });
    // 전문은 요약에 쓰지 않으므로 본문을 바꿔도 요약을 다시 만들지 않는다
    return this.get(id, user);
  }

  /** 미리보기 대본을 업로드한 파일 내용으로 바꾼다 */
  async uploadPreview(id: string, user: Viewer, file: UploadedScriptFile): Promise<ScriptDetailDto> {
    await this.findOwned(id, user);
    const { text } = await extractScriptText(file);
    if (text.length > PREVIEW_MAX) {
      throw new BadRequestException(`미리보기는 ${PREVIEW_MAX.toLocaleString()}자 이하여야 합니다`);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.spend(tx, user.id, 'SCRIPT_UPLOAD', id);
      await tx.script.update({ where: { id }, data: { previewText: text, contentUpdatedAt: new Date() } });
      await this.logUpload(tx, id, user.id, file, text, 'PREVIEW');
    });
    return this.get(id, user);
  }

  /**
   * AI 요약 작업을 요청한다. 워커가 아주 빨리 끝내도 "생성 중"으로 남지 않도록
   * 요청 시각을 먼저 기록하고, 큐 등록에 실패하면 되돌린다.
   */
  private async requestSummary(id: string): Promise<boolean> {
    const before = await this.prisma.script.findUniqueOrThrow({
      where: { id },
      select: { aiSummaryRequestedAt: true },
    });
    await this.prisma.script.update({ where: { id }, data: { aiSummaryRequestedAt: new Date() } });
    const ok = await this.aiJobs.enqueueSummarize(id);
    if (!ok) {
      await this.prisma.script.update({
        where: { id },
        data: { aiSummaryRequestedAt: before.aiSummaryRequestedAt },
      });
    }
    return ok;
  }

  /**
   * 전문 열람 기록. 화면이 다시 불러올 때마다 쌓이지 않도록
   * 같은 사람이 같은 대본을 VIEW_LOG_WINDOW_MS 안에 다시 연 것은 한 번으로 본다.
   */
  private async logView(scriptId: string, userId: string) {
    const recent = await this.prisma.scriptAccessLog.findFirst({
      where: { scriptId, userId, viewedAt: { gte: new Date(Date.now() - VIEW_LOG_WINDOW_MS) } },
      select: { id: true },
    });
    if (!recent) await this.prisma.scriptAccessLog.create({ data: { scriptId, userId } });
  }

  private logUpload(
    tx: Tx,
    scriptId: string,
    uploaderId: string,
    file: UploadedScriptFile,
    text: string,
    kind: 'FULL' | 'PREVIEW',
  ) {
    return tx.scriptUpload.create({
      data: {
        scriptId,
        uploaderId,
        kind,
        filename: Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255),
        mimeType: file.mimetype.slice(0, 120),
        sizeBytes: file.size,
        charCount: text.length,
      },
    });
  }

  /** 공개. 권리 보유 진술(rightsDeclared=true)이 있어야 한다. 이미 공개면 그대로 반환. */
  async publish(id: string, user: Viewer, dto: PublishScriptDto): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    if (script.status === 'HIDDEN') {
      throw new ForbiddenException('관리자가 숨긴 대본은 다시 공개할 수 없습니다');
    }
    if (script.status === 'PUBLISHED') return this.get(id, user);

    const declared = script.rightsDeclared || dto.rightsDeclared === true;
    if (!declared) {
      throw new BadRequestException('공개하려면 권리 보유 진술(rightsDeclared=true)이 필요합니다');
    }
    const missing = [
      !script.logline.trim() && '로그라인',
      !script.synopsis.trim() && '시놉시스',
      (!script.genre.trim() || script.genre === '미정') && '장르',
      !script.fullText.trim() && '대본 전문',
    ].filter(Boolean);
    if (missing.length) throw new BadRequestException(`공개하려면 ${missing.join(', ')}을(를) 채워야 합니다`);
    await this.prisma.script.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        rightsDeclared: true,
        rightsDeclaredAt: script.rightsDeclaredAt ?? new Date(),
      },
    });
    // 내용이 바뀔 때마다 요약을 만들어 두므로, 요약이 없거나 실패했을 때만 다시 요청한다
    if (canSummarize(script) && !script.aiSummary && !isSummaryPending(script)) await this.requestSummary(id);
    return this.get(id, user);
  }

  private async findOwned(id: string, user: Viewer) {
    const script = await this.prisma.script.findUnique({ where: { id } });
    if (!script || !canSeeScript(script, user)) throw new NotFoundException('대본을 찾을 수 없습니다');
    if (script.authorId !== user.id) throw new ForbiddenException('작가 본인만 수정할 수 있습니다');
    // (정지·탈퇴한 사용자는 인증 단계에서 이미 막힌다)
    return script;
  }
}
