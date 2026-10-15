import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ContractsService, type SignatureMeta } from '../contracts/contracts.service.js';
import type { Viewer } from './access-rules.js';
import type {
  AccessRequestDto,
  CreateAccessRequestDto,
  ListAccessRequestsQueryDto,
} from './dto/access.dto.js';

const INCLUDE = {
  script: { select: { id: true, title: true, authorId: true } },
  producer: { select: { id: true, displayName: true } },
} as const;

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
  ) {}

  /**
   * 제작자가 공개 대본의 전문 열람을 요청한다 (NDA 동의 필수).
   * 같은 트랜잭션에서 비밀유지 서약서를 만들고 제작자의 전자서명(입력한 이름, 시각, 접속 정보)을 남긴다.
   */
  async request(
    scriptId: string,
    producer: Viewer,
    dto: CreateAccessRequestDto,
    meta: SignatureMeta = { ip: null, userAgent: null },
  ): Promise<AccessRequestDto> {
    if (dto.ndaAccepted !== true) {
      throw new BadRequestException('NDA에 동의해야 열람을 요청할 수 있습니다');
    }
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, authorId: true, status: true, author: { select: { displayName: true } } },
    });
    if (!script || script.status !== 'PUBLISHED') {
      throw new NotFoundException('공개된 대본을 찾을 수 없습니다');
    }
    if (script.authorId === producer.id) {
      throw new BadRequestException('자신의 대본에는 열람을 요청할 수 없습니다');
    }
    const existing = await this.prisma.scriptAccessRequest.findUnique({
      where: { scriptId_producerId: { scriptId, producerId: producer.id } },
    });
    if (existing) {
      throw new ConflictException(`이미 열람을 요청했습니다 (${existing.status})`);
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: producer.id }, select: { id: true, displayName: true } });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.scriptAccessRequest.create({
        data: { scriptId, producerId: producer.id, status: 'PENDING', ndaAcceptedAt: new Date() },
      });
      const nda = await this.contracts.createNda(
        tx,
        { accessRequestId: created.id, script, writerName: script.author.displayName, producer: me },
        dto.signedName?.trim() || me.displayName,
        meta,
      );
      const row = await tx.scriptAccessRequest.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE });
      return { ...row, ndaContractId: nda.id };
    }) as unknown as Promise<AccessRequestDto>;
  }

  async list(user: Viewer, query: ListAccessRequestsQueryDto): Promise<AccessRequestDto[]> {
    const asWriter = { script: { authorId: user.id } };
    const asProducer = { producerId: user.id };
    const scope =
      query.as === 'writer'
        ? asWriter
        : query.as === 'producer'
          ? asProducer
          : { OR: [asWriter, asProducer] };
    return this.prisma.scriptAccessRequest.findMany({
      where: { ...scope, ...(query.status ? { status: query.status } : {}) },
      include: INCLUDE,
      orderBy: [{ ndaAcceptedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    }) as unknown as Promise<AccessRequestDto[]>;
  }

  approve(id: string, writer: Viewer) {
    return this.decide(id, writer, 'APPROVED');
  }

  reject(id: string, writer: Viewer) {
    return this.decide(id, writer, 'REJECTED');
  }

  /** 대본 작가만, PENDING 요청만 결정할 수 있다. 동시 결정은 조건부 update로 막는다. */
  private async decide(
    id: string,
    writer: Viewer,
    status: 'APPROVED' | 'REJECTED',
  ): Promise<AccessRequestDto> {
    const request = await this.prisma.scriptAccessRequest.findUnique({
      where: { id },
      include: { script: { select: { authorId: true } } },
    });
    if (!request) throw new NotFoundException('열람 요청을 찾을 수 없습니다');
    if (request.script.authorId !== writer.id) {
      throw new ForbiddenException('대본 작가만 열람 요청을 처리할 수 있습니다');
    }
    const { count } = await this.prisma.scriptAccessRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, decidedAt: new Date() },
    });
    if (count === 0) throw new ConflictException(`이미 처리된 요청입니다 (${request.status})`);
    return this.prisma.scriptAccessRequest.findUniqueOrThrow({
      where: { id },
      include: INCLUDE,
    }) as unknown as Promise<AccessRequestDto>;
  }
}
