import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { canReadFullText, canSeeScript, type Viewer } from '../access/access-rules.js';
import { AiJobsQueue } from './ai-jobs.queue.js';
import { extractScriptText } from './script-file.js';
import type {
  CreateScriptDto,
  ListScriptsQueryDto,
  PublishScriptDto,
  ScriptDetailDto,
  ScriptListDto,
  ScriptSummaryDto,
  UpdateScriptDto,
} from './dto/script.dto.js';

/** 목록·상세에서 공통으로 내보내는 공개 필드 (fullText 제외) */
const PUBLIC_SELECT = {
  id: true,
  title: true,
  logline: true,
  synopsis: true,
  genre: true,
  status: true,
  aiSummary: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, displayName: true } },
} as const;

export const VIEW_LOG_WINDOW_MS = 10 * 60 * 1000;

export interface UploadedScriptFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class ScriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiJobs: AiJobsQueue,
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
        status: 'DRAFT',
        rightsDeclared: declared,
        rightsDeclaredAt: declared ? new Date() : null,
      },
    });
    return this.get(script.id, user);
  }

  async list(query: ListScriptsQueryDto, viewer: Viewer | null): Promise<ScriptListDto> {
    if (query.mine && !viewer) throw new ForbiddenException('로그인이 필요합니다');
    const take = query.take ?? 20;
    const where = {
      ...(query.mine ? { authorId: viewer!.id } : { status: 'PUBLISHED' as const }),
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
    const items = rows.slice(0, take) as unknown as ScriptSummaryDto[];
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  }

  /** 상세. fullText는 작가와 열람 승인된 제작자에게만 주고, 제작자가 볼 때는 열람 로그를 남긴다. */
  async get(id: string, viewer: Viewer | null): Promise<ScriptDetailDto> {
    const script = await this.prisma.script.findUnique({
      where: { id },
      select: { ...PUBLIC_SELECT, authorId: true, rightsDeclared: true, rightsDeclaredAt: true },
    });
    if (!script || !canSeeScript(script, viewer)) throw new NotFoundException('대본을 찾을 수 없습니다');

    const isAuthor = viewer?.id === script.authorId;
    const access =
      viewer && !isAuthor
        ? await this.prisma.scriptAccessRequest.findUnique({
            where: { scriptId_producerId: { scriptId: id, producerId: viewer.id } },
            select: { status: true },
          })
        : null;
    const accessStatus = access?.status ?? null;
    const full = canReadFullText(script, viewer, accessStatus);

    let fullText: string | null = null;
    if (full) {
      const row = await this.prisma.script.findUniqueOrThrow({
        where: { id },
        select: { fullText: true },
      });
      fullText = row.fullText;
      if (!isAuthor) await this.logView(id, viewer!.id);
    }

    const { authorId: _authorId, ...rest } = script;
    return {
      ...rest,
      fullText,
      viewer: { isAuthor, accessRequestStatus: accessStatus, canReadFullText: full },
    } as unknown as ScriptDetailDto;
  }

  async update(id: string, user: Viewer, dto: UpdateScriptDto): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    if (dto.rightsDeclared === false && script.status === 'PUBLISHED') {
      throw new BadRequestException('공개 중인 대본은 권리 보유 진술을 철회할 수 없습니다');
    }
    const fullTextChanged = dto.fullText !== undefined && dto.fullText !== script.fullText;
    await this.prisma.script.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.logline !== undefined && { logline: dto.logline.trim() }),
        ...(dto.synopsis !== undefined && { synopsis: dto.synopsis }),
        ...(dto.genre !== undefined && { genre: dto.genre.trim() }),
        ...(dto.fullText !== undefined && { fullText: dto.fullText }),
        ...(dto.rightsDeclared === true &&
          !script.rightsDeclared && { rightsDeclared: true, rightsDeclaredAt: new Date() }),
        ...(dto.rightsDeclared === false && { rightsDeclared: false, rightsDeclaredAt: null }),
      },
    });
    if (fullTextChanged && script.status === 'PUBLISHED') {
      await this.aiJobs.enqueueSummarize(id);
    }
    return this.get(id, user);
  }

  /** 파일을 올려 새 초안(DRAFT)을 만든다. 제목은 파일 이름, 로그라인·시놉시스는 비워 둔다 */
  async createFromUpload(user: Viewer, file: UploadedScriptFile): Promise<ScriptDetailDto> {
    const { text, suggestedTitle } = await extractScriptText(file);
    const script = await this.prisma.script.create({
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
    await this.logUpload(script.id, user.id, file, text);
    return this.get(script.id, user);
  }

  /** 기존 대본의 본문을 업로드한 파일 내용으로 바꾼다 */
  async replaceFromUpload(id: string, user: Viewer, file: UploadedScriptFile): Promise<ScriptDetailDto> {
    const script = await this.findOwned(id, user);
    const { text } = await extractScriptText(file);
    await this.prisma.script.update({ where: { id }, data: { fullText: text } });
    await this.logUpload(id, user.id, file, text);
    if (script.status === 'PUBLISHED' && text !== script.fullText) await this.aiJobs.enqueueSummarize(id);
    return this.get(id, user);
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

  private logUpload(scriptId: string, uploaderId: string, file: UploadedScriptFile, text: string) {
    return this.prisma.scriptUpload.create({
      data: {
        scriptId,
        uploaderId,
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
    await this.aiJobs.enqueueSummarize(id);
    return this.get(id, user);
  }

  private async findOwned(id: string, user: Viewer) {
    const script = await this.prisma.script.findUnique({ where: { id } });
    if (!script || !canSeeScript(script, user)) throw new NotFoundException('대본을 찾을 수 없습니다');
    if (script.authorId !== user.id) throw new ForbiddenException('작가 본인만 수정할 수 있습니다');
    return script;
  }
}
