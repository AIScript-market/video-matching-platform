import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { VIDEO_MAX_BYTES, VIDEO_STORAGE, VIDEO_TYPES, type VideoStorage } from '../../core/video-storage.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Viewer } from '../access/access-rules.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { splitAmong } from '../contracts/revenue-shares.js';
import { validateSettlementMonth } from '../contracts/settlement-rules.js';
import { DealsService } from '../deals/deals.service.js';
import type {
  ChannelVideoDto,
  CreateVideoUploadDto,
  PublishVideoDto,
  RecordPayoutDto,
  RecordRevenueDto,
  ReviewVideoDto,
  RevenueLineDto,
  SettlementDto,
  ShareLineDto,
  SubmitVideoDto,
  VideoFileUrlDto,
  VideoStatusName,
  VideoUploadDto,
} from './channel.dto.js';

const VIDEO_INCLUDE = { deal: { select: { negotiation: { select: { script: { select: { title: true } } } } } } } as const;

type VideoRow = Prisma.ChannelVideoGetPayload<{ include: typeof VIDEO_INCLUDE }>;

const SHARE_ORDER: Record<string, number> = { WRITER: 0, PRODUCER: 1, PERFORMER: 2, OTHER: 3, PLATFORM: 4 };

function toVideo({ deal, reviewedById: _r, updatedAt: _u, fileKey, fileDeletedAt, ...v }: VideoRow): ChannelVideoDto {
  return {
    ...v,
    fileAvailable: Boolean(fileKey && !fileDeletedAt),
    rightsChecklist: v.rightsChecklist as unknown as ChannelVideoDto['rightsChecklist'],
    scriptTitle: deal.negotiation.script.title,
  };
}

/** 저장소 key: deals/<딜>/<무작위>/<파일 이름>. 파일 이름의 경로 구분자·제어 문자는 _로 */
const FILE_KEY = /^deals\/([^/]+)\/[0-9a-f-]{36}\/([^/]{1,200})$/;

export function videoFileType(fileName: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
  return (ext && VIDEO_TYPES[ext]) ?? null;
}

export function videoFileKey(dealId: string, fileName: string): string {
  const safe = fileName.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(-200);
  return `deals/${dealId}/${randomUUID()}/${safe}`;
}

/**
 * 영상 게시와 정산 (docs/business-model.md).
 * 제작자 제출 → 관리자 검수 → 관리자가 우리 장르 채널에 올리고 영상 번호 기록 → 끝난 달 확정 수익 입력 → 배분율대로 정산 → 지급 기록.
 */
@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
    private readonly contracts: ContractsService,
    @Inject(VIDEO_STORAGE) private readonly storage: VideoStorage,
  ) {}

  // ---------- 제출 ----------

  /** 영상을 낼 수 있는가: 딜의 제작자, 딜 ACTIVE, 채널 게시 계약 서명 */
  private async assertCanSubmit(dealId: string, user: Viewer) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, select: { status: true, negotiation: { select: { producerId: true, writerId: true } } } });
    if (!deal || (deal.negotiation.producerId !== user.id && deal.negotiation.writerId !== user.id)) {
      throw new NotFoundException('딜을 찾을 수 없습니다');
    }
    if (deal.negotiation.producerId !== user.id) throw new ForbiddenException('영상은 딜의 제작자만 제출할 수 있습니다');
    if (deal.status !== 'ACTIVE') {
      throw new ConflictException({ message: '대본 이용허락 계약에 양쪽이 서명한 뒤에 영상을 제출할 수 있습니다', error: 'DEAL_NOT_ACTIVE' });
    }
    if (!(await this.contracts.hasSignedChannelContract(user.id))) {
      throw new ConflictException({ message: '먼저 채널 게시 계약에 서명해 주세요', error: 'CHANNEL_CONTRACT_REQUIRED' });
    }
  }

  private assertStorage() {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException({ message: '영상 파일 올리기가 아직 준비되지 않았습니다. 영상 링크로 제출해 주세요', error: 'VIDEO_UPLOAD_DISABLED' });
    }
  }

  /** 영상 파일을 저장소에 바로 올릴 서명 주소를 만든다. 브라우저가 올린 뒤 key를 fileKey로 제출한다 */
  async createUpload(dealId: string, user: Viewer, dto: CreateVideoUploadDto): Promise<VideoUploadDto> {
    this.assertStorage();
    await this.assertCanSubmit(dealId, user);
    const contentType = videoFileType(dto.fileName);
    if (!contentType) throw new BadRequestException('mp4·mov·webm·mkv 영상 파일만 올릴 수 있습니다');
    const key = videoFileKey(dealId, dto.fileName);
    const signed = await this.storage.presignUpload(key, contentType, dto.sizeBytes);
    return { key, uploadUrl: signed.url, headers: signed.headers, expiresAt: signed.expiresAt };
  }

  async submit(dealId: string, user: Viewer, dto: SubmitVideoDto): Promise<ChannelVideoDto> {
    if (Boolean(dto.sourceUrl) === Boolean(dto.fileKey)) throw new BadRequestException('영상 링크나 영상 파일 중 하나로 제출해 주세요');
    await this.assertCanSubmit(dealId, user);
    let file: { fileKey: string; fileName: string; fileSizeBytes: number } | null = null;
    if (dto.fileKey) {
      this.assertStorage();
      const m = FILE_KEY.exec(dto.fileKey);
      if (!m || m[1] !== dealId) throw new BadRequestException('이 딜에 올린 영상 파일이 아닙니다');
      const stat = await this.storage.stat(dto.fileKey);
      if (!stat) throw new BadRequestException('영상 파일이 아직 다 올라가지 않았습니다. 올리기가 끝난 뒤 다시 제출해 주세요');
      if (stat.sizeBytes > VIDEO_MAX_BYTES) {
        await this.storage.remove(dto.fileKey);
        throw new BadRequestException('영상 파일은 2GB까지 올릴 수 있습니다');
      }
      file = { fileKey: dto.fileKey, fileName: m[2], fileSizeBytes: stat.sizeBytes };
    }
    const v = await this.prisma.channelVideo
      .create({
        data: {
          dealId,
          producerId: user.id,
          title: dto.title,
          description: dto.description?.trim() || null,
          sourceUrl: dto.sourceUrl ?? null,
          ...file,
          rightsChecklist: {
            musicCleared: dto.rights.musicCleared,
            materialsCleared: dto.rights.materialsCleared,
            performersConsented: dto.rights.performersConsented,
            adDisclosureChecked: dto.rights.adDisclosureChecked,
            containsPaidPromotion: dto.rights.containsPaidPromotion,
            sources: dto.rights.sources?.trim() || null,
          },
        },
        include: VIDEO_INCLUDE,
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('이미 제출한 영상 파일입니다');
        throw e;
      });
    return toVideo(v);
  }

  async listForDeal(dealId: string, user: Viewer): Promise<ChannelVideoDto[]> {
    await this.deals.assertCanView(dealId, user);
    const rows = await this.prisma.channelVideo.findMany({ where: { dealId }, include: VIDEO_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(toVideo);
  }

  // ---------- 관리자: 검수·게시 ----------

  async adminList(status?: VideoStatusName): Promise<ChannelVideoDto[]> {
    const rows = await this.prisma.channelVideo.findMany({
      where: status ? { status } : {},
      include: VIDEO_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map(toVideo);
  }

  /** 관리자: 저장소에 올라온 영상을 보거나 내려받을 서명 주소 */
  async fileUrl(id: string, download: boolean): Promise<VideoFileUrlDto> {
    const v = await this.prisma.channelVideo.findUnique({ where: { id }, select: { fileKey: true, fileName: true, fileDeletedAt: true } });
    if (!v) throw new NotFoundException('영상을 찾을 수 없습니다');
    if (!v.fileKey) throw new BadRequestException('링크로 제출한 영상입니다');
    if (v.fileDeletedAt) throw new ConflictException('검수가 끝나 저장소에서 지운 영상입니다');
    this.assertStorage();
    const signed = await this.storage.presignDownload(v.fileKey, v.fileName ?? 'video', download);
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  async review(id: string, admin: Viewer, dto: ReviewVideoDto): Promise<ChannelVideoDto> {
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) throw new BadRequestException('거절하면 이유를 적어 주세요');
    const v = await this.transition(id, ['SUBMITTED'], {
      status: dto.decision,
      reviewNote: dto.note?.trim() || null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    });
    // 거절한 영상은 다시 볼 일이 없다 (고친 영상은 새로 제출한다)
    return dto.decision === 'REJECTED' ? this.discardFile(v) : v;
  }

  async publish(id: string, dto: PublishVideoDto): Promise<ChannelVideoDto> {
    try {
      const v = await this.transition(id, ['APPROVED'], {
        status: 'PUBLISHED',
        channelName: dto.channelName,
        youtubeVideoId: dto.youtubeVideoId,
        publishedAt: new Date(),
      });
      // YouTube에 올라갔으니 원본은 지운다 (원본은 제작자에게 있다)
      return await this.discardFile(v);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 다른 영상에 기록된 YouTube 영상 번호입니다');
      }
      throw e;
    }
  }

  async remove(id: string, note: string): Promise<ChannelVideoDto> {
    return this.discardFile(await this.transition(id, ['APPROVED', 'PUBLISHED'], { status: 'REMOVED', reviewNote: note.trim() }));
  }

  /**
   * 검수가 끝난 영상 파일을 저장소에서 지운다. 실패해도 상태 변경은 되돌리지 않는다
   * (기록만 남기고, 남은 파일은 저장소의 보관 기간 규칙이 지운다. docs/deploy.md).
   */
  private async discardFile(v: ChannelVideoDto): Promise<ChannelVideoDto> {
    if (!v.fileAvailable) return v;
    const row = await this.prisma.channelVideo.findUnique({ where: { id: v.id }, select: { fileKey: true } });
    if (!row?.fileKey || !this.storage.enabled) return v;
    try {
      await this.storage.remove(row.fileKey);
    } catch (e) {
      this.logger.warn(`영상 파일을 지우지 못했습니다 (${v.id}): ${(e as Error).message}`);
      return v;
    }
    await this.prisma.channelVideo.update({ where: { id: v.id }, data: { fileDeletedAt: new Date() } });
    return { ...v, fileAvailable: false };
  }

  private async transition(id: string, from: VideoStatusName[], data: Prisma.ChannelVideoUncheckedUpdateManyInput): Promise<ChannelVideoDto> {
    const { count } = await this.prisma.channelVideo.updateMany({ where: { id, status: { in: from } }, data });
    if (count === 0) {
      const exists = await this.prisma.channelVideo.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw new NotFoundException('영상을 찾을 수 없습니다');
      throw new ConflictException(`지금 상태(${exists.status})에서는 할 수 없습니다`);
    }
    return toVideo(await this.prisma.channelVideo.findUniqueOrThrow({ where: { id }, include: VIDEO_INCLUDE }));
  }

  // ---------- 정산 ----------

  /** 관리자: 끝난 달의 YouTube 확정 수익을 영상마다 기록한다 (게시했거나 게시 후 내린 영상만). 그 달에 적용되는 계약을 함께 고정한다 */
  async recordRevenue(videoId: string, admin: Viewer, dto: RecordRevenueDto): Promise<RevenueLineDto> {
    validateSettlementMonth(dto.month);
    const video = await this.prisma.channelVideo.findUnique({ where: { id: videoId }, select: { status: true, publishedAt: true, dealId: true } });
    if (!video) throw new NotFoundException('영상을 찾을 수 없습니다');
    if (!video.publishedAt) throw new ConflictException('게시한 적 없는 영상에는 수익을 기록할 수 없습니다');
    const contract = await this.contracts.applicableLicense(video.dealId, dto.month);
    if (!contract) throw new ConflictException(`${dto.month}에 적용되는 서명된 이용허락 계약이 없습니다`);
    try {
      const r = await this.prisma.videoRevenue.create({
        data: { videoId, month: dto.month, amountKrw: dto.amountKrw, contractId: contract.id, memo: dto.memo?.trim() || null, createdById: admin.id },
      });
      return (await this.settlement(video.dealId, admin)).lines.find((l) => l.id === r.id)!;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`${dto.month} 수익은 이미 기록했습니다`);
      }
      throw e;
    }
  }

  /** 딜의 정산서: 영상·월별 확정 수익, 그 달 계약의 배분율로 나눈 당사자별 몫(플랫폼 0), 지급 기록, 당사자별 합계 */
  async settlement(dealId: string, user: Viewer): Promise<SettlementDto> {
    await this.deals.assertCanView(dealId, user);
    const revenues = await this.prisma.videoRevenue.findMany({
      where: { video: { dealId } },
      include: {
        video: { select: { title: true } },
        payouts: true,
        contract: { include: { parties: true } },
      },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
    });
    const lines: RevenueLineDto[] = [];
    for (const r of revenues) {
      const contract = r.contract ?? (await this.contracts.applicableLicense(dealId, r.month));
      if (!contract) continue;
      // 표시 순서를 고정한다: 작가 → 제작자 → 출연자 → 그 밖, 같은 역할은 이름순
      const sharing = contract.parties
        .filter((p) => p.revenueShareBp !== null && p.role !== 'PLATFORM')
        .sort((a, b) => SHARE_ORDER[a.role] - SHARE_ORDER[b.role] || a.legalName.localeCompare(b.legalName));
      const split = splitAmong(
        r.amountKrw,
        contract.parties.map((p) => ({ key: p.id, role: p.role, revenueShareBp: p.revenueShareBp, receivesRemainder: p.receivesRemainder })),
      );
      lines.push({
        id: r.id,
        videoId: r.videoId,
        videoTitle: r.video.title,
        month: r.month,
        amountKrw: r.amountKrw,
        contractId: contract.id,
        platformKrw: 0,
        shares: sharing.map((p) => {
          const paid = r.payouts.find((x) => x.partyId === p.id);
          return {
            partyId: p.id,
            role: p.role as ShareLineDto['role'],
            name: p.legalName,
            label: p.label,
            revenueShareBp: p.revenueShareBp!,
            amountKrw: split.get(p.id) ?? 0,
            payout: paid ? { id: paid.id, amountKrw: paid.amountKrw, paidAt: paid.paidAt, memo: paid.memo } : null,
          };
        }),
      });
    }
    // 당사자별 합계: 계약이 바뀌어도 같은 사람은 한 줄 (contract party → user)
    const parties = await this.prisma.contractParty.findMany({
      where: { id: { in: lines.flatMap((l) => l.shares.map((x) => x.partyId)) } },
      select: { id: true, userId: true },
    });
    const userOf = new Map(parties.map((p) => [p.id, p.userId ?? p.id]));
    const totals = new Map<string, { userId: string; name: string; role: ShareLineDto['role']; dueKrw: number; paidKrw: number }>();
    for (const l of lines) {
      for (const x of l.shares) {
        const uid = userOf.get(x.partyId)!;
        const t = totals.get(uid) ?? { userId: uid, name: x.name, role: x.role, dueKrw: 0, paidKrw: 0 };
        t.dueKrw += x.amountKrw;
        t.paidKrw += x.payout?.amountKrw ?? 0;
        totals.set(uid, t);
      }
    }
    return { dealId, lines, totalRevenueKrw: lines.reduce((a, l) => a + l.amountKrw, 0), totals: [...totals.values()] };
  }

  /** 관리자: 플랫폼 밖에서 이체한 뒤 당사자 한 명에 대한 지급을 기록한다. 금액은 배분 규칙으로 정해져 있어 입력받지 않는다 */
  async recordPayout(revenueId: string, admin: Viewer, dto: RecordPayoutDto): Promise<SettlementDto> {
    const r = await this.prisma.videoRevenue.findUnique({
      where: { id: revenueId },
      include: { video: { select: { dealId: true } }, contract: { include: { parties: true } } },
    });
    if (!r) throw new NotFoundException('수익 기록을 찾을 수 없습니다');
    const contract = r.contract ?? (await this.contracts.applicableLicense(r.video.dealId, r.month));
    const party = contract?.parties.find((p) => p.id === dto.partyId);
    if (!contract || !party || party.role === 'PLATFORM' || party.revenueShareBp === null || !party.userId) {
      throw new BadRequestException('이 수익을 배분받는 당사자가 아닙니다');
    }
    const split = splitAmong(
      r.amountKrw,
      contract.parties.map((p) => ({ key: p.id, role: p.role, revenueShareBp: p.revenueShareBp, receivesRemainder: p.receivesRemainder })),
    );
    try {
      await this.prisma.settlementPayout.create({
        data: {
          revenueId,
          partyId: party.id,
          role: party.role,
          recipientId: party.userId,
          amountKrw: split.get(party.id) ?? 0,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          memo: dto.memo?.trim() || null,
          createdById: admin.id,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('이미 지급을 기록했습니다');
      throw e;
    }
    return this.settlement(r.video.dealId, admin);
  }
}
