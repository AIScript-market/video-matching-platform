import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../core/auth/index.js';
import type {
  IdentityVerification,
  LikenessAsset,
  Prisma,
  TalentProfile,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDays,
  adultOnFrom,
  isMinorAt,
  missingActivationSteps,
  POLICY_VERSION,
  purgeDateFor,
  WITHDRAW_COOLING_OFF_DAYS,
} from './likeness-policy.js';
import { LIKENESS_VAULT, type LikenessVault } from './likeness-vault.js';
import type {
  AccessLogEntryDto,
  AssetKind,
  ConsentDto,
  CreateTalentProfileDto,
  IdentityDto,
  LikenessAssetDto,
  TalentDirectoryQueryDto,
  TalentPublicDto,
  TalentSelfDto,
  UpdateTalentProfileDto,
  WardDto,
} from './talent.dto.js';
import { IDENTITY_VERIFIER, LIVENESS_CHECKER, type IdentityVerifier, type LivenessChecker } from './verification.js';

/** 이 모듈이 쓰는 사용자 정보 (AuthUser의 일부) */
export type TalentUser = Pick<AuthUser, 'id' | 'email' | 'roles'>;

export const MAX_ASSET_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES: Record<AssetKind, RegExp> = {
  FACE_SCAN: /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm)|model\/(gltf-binary|obj)|application\/octet-stream)$/,
  VOICE: /^audio\/(wav|x-wav|mpeg|mp4|webm|ogg|flac)$/,
  MOTION: /^(video\/(mp4|quicktime|webm)|application\/octet-stream)$/,
};

const PROFILE_INCLUDE = {
  user: { select: { identity: true } },
  assets: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TalentProfileInclude;

type ProfileWithRelations = TalentProfile & { user: { identity: IdentityVerification | null }; assets: LikenessAsset[] };

function toAssetDto(a: LikenessAsset): LikenessAssetDto {
  return { id: a.id, kind: a.kind, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, createdAt: a.createdAt };
}

export function stepsFor(p: ProfileWithRelations, now = new Date()) {
  return missingActivationSteps(
    {
      identity: p.user.identity,
      livenessVerifiedAt: p.livenessVerifiedAt,
      activeFaceScans: p.assets.filter((a) => a.kind === 'FACE_SCAN').length,
      consentedAt: p.consentedAt,
      consentVersion: p.consentVersion,
      guardianId: p.guardianId,
      guardianConsentAt: p.guardianConsentAt,
      guardianVerifiedAt: p.guardianVerifiedAt,
    },
    now,
  );
}

export function toPublicDto(p: TalentProfile & { user: { identity: IdentityVerification | null } }, now = new Date()): TalentPublicDto {
  return {
    id: p.id,
    userId: p.userId,
    stageName: p.stageName,
    kind: p.kind,
    bio: p.bio,
    allowedTags: p.allowedTags,
    minFeeKrw: p.minFeeKrw,
    isMinor: p.user.identity ? isMinorAt(p.user.identity, now) : false,
  };
}

function toWardDto(r: TalentProfile): WardDto {
  return { talentId: r.id, stageName: r.stageName, status: r.status, guardianConsentAt: r.guardianConsentAt, guardianVerifiedAt: r.guardianVerifiedAt };
}

@Injectable()
export class TalentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_VERIFIER) private readonly identityVerifier: IdentityVerifier,
    @Inject(LIVENESS_CHECKER) private readonly liveness: LivenessChecker,
    @Inject(LIKENESS_VAULT) private readonly vault: LikenessVault,
  ) {}

  // --- 본인인증 (출연자, 보호자) -------------------------------------------------

  async verifyIdentity(user: TalentUser, token: string): Promise<IdentityDto> {
    const result = await this.identityVerifier.verify(token);
    const now = new Date();
    const adultOn = adultOnFrom(result.birthDate);
    const isMinor = adultOn > now;
    const existing = await this.prisma.identityVerification.findUnique({ where: { userId: user.id } });
    if (existing && existing.legalName !== result.legalName) {
      throw new ConflictException('이 계정은 이미 다른 사람으로 본인인증되었습니다');
    }
    const row = await this.prisma.identityVerification.upsert({
      where: { userId: user.id },
      create: { userId: user.id, provider: this.identityVerifier.name, legalName: result.legalName, isMinor, adultOn: isMinor ? adultOn : null },
      update: { provider: this.identityVerifier.name, isMinor, adultOn: isMinor ? adultOn : null, verifiedAt: now },
    });
    const profiles = await this.prisma.talentProfile.findMany({
      where: { OR: [{ userId: user.id }, { guardianId: user.id }] },
      select: { id: true },
    });
    for (const p of profiles) await this.refreshStatus(p.id);
    return { legalName: row.legalName, isMinor: row.isMinor, adultOn: row.adultOn, verifiedAt: row.verifiedAt };
  }

  async identity(user: TalentUser): Promise<IdentityDto | null> {
    const row = await this.prisma.identityVerification.findUnique({ where: { userId: user.id } });
    return row && { legalName: row.legalName, isMinor: row.isMinor, adultOn: row.adultOn, verifiedAt: row.verifiedAt };
  }

  // --- 프로필 ----------------------------------------------------------------

  async createProfile(user: TalentUser, dto: CreateTalentProfileDto): Promise<TalentSelfDto> {
    if (user.roles.includes('ADMIN')) throw new ForbiddenException('관리자 계정은 출연자로 등록할 수 없습니다');
    const existing = await this.prisma.talentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) throw new ConflictException('이미 출연자로 등록되어 있습니다');
    await this.prisma.talentProfile.create({
      data: {
        userId: user.id,
        kind: dto.kind,
        stageName: dto.stageName.trim(),
        bio: dto.bio?.trim() || null,
        allowedTags: dto.allowedTags,
        minFeeKrw: dto.minFeeKrw ?? 0,
        guardianEmail: dto.guardianEmail?.toLowerCase() ?? null,
      },
    });
    return this.me(user);
  }

  async updateProfile(user: TalentUser, dto: UpdateTalentProfileDto): Promise<TalentSelfDto> {
    const profile = await this.ownProfile(user);
    if (dto.guardianEmail && profile.guardianId) {
      throw new ConflictException('보호자가 이미 연결되어 있습니다. 바꾸려면 운영팀에 문의하세요');
    }
    await this.prisma.talentProfile.update({
      where: { id: profile.id },
      data: {
        stageName: dto.stageName?.trim(),
        bio: dto.bio,
        allowedTags: dto.allowedTags ?? undefined,
        minFeeKrw: dto.minFeeKrw ?? undefined,
        guardianEmail: dto.guardianEmail?.toLowerCase(),
      },
    });
    return this.me(user);
  }

  /** 내 출연자 프로필. 등록하지 않았으면 null */
  async meOrNull(user: TalentUser): Promise<TalentSelfDto | null> {
    const exists = await this.prisma.talentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return exists ? this.me(user) : null;
  }

  async me(user: TalentUser): Promise<TalentSelfDto> {
    const p = await this.ownProfile(user);
    const pub = toPublicDto(p);
    return {
      id: pub.id,
      userId: pub.userId,
      stageName: pub.stageName,
      kind: pub.kind,
      bio: pub.bio,
      allowedTags: pub.allowedTags,
      minFeeKrw: pub.minFeeKrw,
      isMinor: pub.isMinor,
      status: p.status,
      missingSteps: stepsFor(p),
      assets: p.assets.map(toAssetDto),
      guardianEmail: p.guardianEmail,
      guardianLinked: p.guardianId !== null,
      withdrawRequestedAt: p.withdrawRequestedAt,
      purgeAfter: p.purgeAfter,
    };
  }

  async directory(query: TalentDirectoryQueryDto): Promise<TalentPublicDto[]> {
    const rows = await this.prisma.talentProfile.findMany({
      where: {
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.tag ? { allowedTags: { has: query.tag } } : {}),
      },
      include: { user: { select: { identity: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.take ?? 50,
    });
    const now = new Date();
    return rows.map((r) => toPublicDto(r, now)).filter((v) => query.minor === undefined || v.isMinor === query.minor);
  }

  async publicProfile(talentId: string): Promise<TalentPublicDto> {
    const row = await this.prisma.talentProfile.findFirst({
      where: { id: talentId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      include: { user: { select: { identity: true } } },
    });
    if (!row) throw new NotFoundException('출연자를 찾을 수 없습니다');
    return toPublicDto(row);
  }

  // --- 등록 데이터 -------------------------------------------------------------

  async uploadAsset(user: TalentUser, kind: AssetKind, file: { buffer: Buffer; mimetype: string; size: number } | undefined): Promise<LikenessAssetDto> {
    if (!file || file.size === 0) throw new BadRequestException('파일이 필요합니다');
    if (file.size > MAX_ASSET_BYTES) throw new BadRequestException('파일이 너무 큽니다');
    if (!ALLOWED_TYPES[kind].test(file.mimetype)) throw new BadRequestException(`${kind}에 쓸 수 없는 파일 형식입니다: ${file.mimetype}`);
    const profile = await this.ownProfile(user);
    this.assertNotWithdrawing(profile);
    if (!profile.user.identity) throw new BadRequestException('본인인증을 먼저 해 주세요');

    const stored = await this.vault.store(file.buffer);
    const asset = await this.prisma.likenessAsset.create({
      data: { talentId: profile.id, kind, contentType: file.mimetype, sizeBytes: file.size, ...stored },
    });
    if (kind === 'FACE_SCAN') {
      // 얼굴 스캔이 바뀌면 셀카 확인을 다시 해야 한다
      await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { livenessVerifiedAt: null } });
    }
    await this.refreshStatus(profile.id);
    return toAssetDto(asset);
  }

  async deleteAsset(user: TalentUser, assetId: string): Promise<void> {
    const profile = await this.ownProfile(user);
    const asset = profile.assets.find((a) => a.id === assetId);
    if (!asset) throw new NotFoundException('파일을 찾을 수 없습니다');
    const inUse = await this.prisma.castingContract.count({
      where: { talentId: profile.id, status: 'ACTIVE', productionEndsAt: { gt: new Date() } },
    });
    if (inUse > 0) throw new ConflictException('제작 기한이 남은 계약이 있어 지금은 지울 수 없습니다. 등록 철회를 이용하세요');
    await this.destroyAsset(asset);
    await this.refreshStatus(profile.id);
  }

  /** 실시간 셀카를 등록한 첫 얼굴 스캔과 대조한다 */
  async verifyLiveness(user: TalentUser, selfie: { buffer: Buffer; size: number } | undefined): Promise<TalentSelfDto> {
    if (!selfie || selfie.size === 0) throw new BadRequestException('셀카 파일이 필요합니다');
    const profile = await this.ownProfile(user);
    const faceScan = profile.assets.find((a) => a.kind === 'FACE_SCAN');
    if (!faceScan?.wrappedKey) throw new BadRequestException('얼굴 스캔을 먼저 올려 주세요');
    const reference = await this.vault.read(faceScan.storageKey, faceScan.wrappedKey);
    const result = await this.liveness.check({ selfie: selfie.buffer, reference });
    if (!result.live) throw new BadRequestException('실시간 확인에 실패했습니다. 사진이 아니라 지금 직접 찍어 주세요');
    if (!result.sameFace) throw new BadRequestException('셀카가 등록한 얼굴 스캔과 일치하지 않습니다');
    await this.prisma.talentProfile.update({ where: { id: profile.id }, data: { livenessVerifiedAt: new Date() } });
    await this.refreshStatus(profile.id);
    return this.me(user);
  }

  async consent(user: TalentUser, dto: ConsentDto): Promise<TalentSelfDto> {
    if (!dto.sensitiveData || !dto.crossBorder) throw new BadRequestException('두 가지 모두 동의해야 등록할 수 있습니다');
    const profile = await this.ownProfile(user);
    this.assertNotWithdrawing(profile);
    await this.prisma.talentProfile.update({
      where: { id: profile.id },
      data: { consentVersion: POLICY_VERSION, consentedAt: new Date() },
    });
    await this.refreshStatus(profile.id);
    return this.me(user);
  }

  /** 원본 내려받기: 본인, 또는 제작 기한 안의 디지털 출연 계약이 있는 기획사 구성원. 매번 기록한다 */
  async readAsset(user: TalentUser, assetId: string): Promise<{ contentType: string; bytes: Buffer }> {
    const asset = await this.prisma.likenessAsset.findFirst({
      where: { id: assetId, status: 'ACTIVE' },
      include: { talent: { select: { userId: true } } },
    });
    if (!asset || !asset.wrappedKey) throw new NotFoundException('파일을 찾을 수 없습니다');

    let contractId: string | null = null;
    let purpose = 'SELF';
    if (asset.talent.userId !== user.id) {
      const contract = await this.prisma.castingContract.findFirst({
        where: {
          talentId: asset.talentId,
          status: 'ACTIVE',
          productionEndsAt: { gt: new Date() },
          usage: { in: ['DIGITAL', 'BOTH'] },
          project: { deal: { negotiation: { OR: [{ writerId: user.id }, { producerId: user.id }] } } },
        },
        orderBy: { productionEndsAt: 'desc' },
        select: { id: true },
      });
      if (!contract) throw new NotFoundException('파일을 찾을 수 없습니다');
      contractId = contract.id;
      purpose = 'PRODUCTION';
    }
    const bytes = await this.vault.read(asset.storageKey, asset.wrappedKey);
    await this.prisma.likenessAccessLog.create({ data: { assetId, userId: user.id, contractId, purpose } });
    return { contentType: asset.contentType, bytes };
  }

  async accessLogs(user: TalentUser): Promise<AccessLogEntryDto[]> {
    const profile = await this.ownProfile(user);
    const rows = await this.prisma.likenessAccessLog.findMany({
      where: { asset: { talentId: profile.id } },
      include: { user: { select: { displayName: true } } },
      orderBy: [{ accessedAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      userId: r.userId,
      userDisplayName: r.user.displayName,
      contractId: r.contractId,
      purpose: r.purpose,
      accessedAt: r.accessedAt,
    }));
  }

  // --- 철회 (3장) ---------------------------------------------------------------

  async withdraw(user: TalentUser): Promise<TalentSelfDto> {
    const profile = await this.ownProfile(user);
    this.assertNotWithdrawing(profile);
    await this.startWithdrawal(profile.id);
    return this.me(user);
  }

  /** 철회 처리. 계정 탈퇴·정지 때도 같은 처리를 쓸 수 있도록 분리했다 */
  async startWithdrawal(talentId: string, now = new Date()): Promise<void> {
    const openContracts = await this.prisma.castingContract.findMany({
      where: { talentId, status: 'ACTIVE', productionEndsAt: { gt: now } },
      select: { productionEndsAt: true },
    });
    await this.prisma.$transaction([
      this.prisma.talentProfile.update({
        where: { id: talentId },
        data: { status: 'WITHDRAWING', withdrawRequestedAt: now, purgeAfter: purgeDateFor(now, openContracts.map((c) => c.productionEndsAt)) },
      }),
      this.prisma.castingOffer.updateMany({
        where: { negotiation: { talentId, status: 'OPEN' }, status: { in: ['PROPOSED', 'PENDING_GUARDIAN'] } },
        data: { status: 'WITHDRAWN', respondedAt: now },
      }),
      this.prisma.castingNegotiation.updateMany({ where: { talentId, status: 'OPEN' }, data: { status: 'CLOSED' } }),
    ]);
  }

  async cancelWithdrawal(user: TalentUser): Promise<TalentSelfDto> {
    const profile = await this.ownProfile(user);
    if (profile.status !== 'WITHDRAWING' || !profile.withdrawRequestedAt) throw new ConflictException('진행 중인 철회가 없습니다');
    if (new Date() > addDays(profile.withdrawRequestedAt, WITHDRAW_COOLING_OFF_DAYS)) {
      throw new ConflictException('7일 숙려 기간이 지나 철회를 취소할 수 없습니다');
    }
    await this.prisma.talentProfile.update({
      where: { id: profile.id },
      data: { status: 'PENDING_VERIFICATION', withdrawRequestedAt: null, purgeAfter: null },
    });
    await this.refreshStatus(profile.id);
    return this.me(user);
  }

  /**
   * 정리 작업: 탈퇴한 계정의 출연자 등록을 철회 처리하고, 삭제 예정일이 지난 원본을 지우고,
   * 기간이 끝난 계약을 만료 처리한다
   */
  async runMaintenance(
    now = new Date(),
    /** 테스트용: 이 출연자들만 처리한다 */
    onlyTalentIds?: string[],
  ): Promise<{ withdrawnAccounts: number; purgedTalents: number; expiredContracts: number }> {
    const scope = onlyTalentIds ? { id: { in: onlyTalentIds } } : {};
    const leftAccounts = await this.prisma.talentProfile.findMany({
      where: { ...scope, user: { status: 'WITHDRAWN' }, status: { in: ['PENDING_VERIFICATION', 'ACTIVE'] } },
      select: { id: true },
    });
    for (const t of leftAccounts) await this.startWithdrawal(t.id, now);

    const due = await this.prisma.talentProfile.findMany({
      where: { ...scope, status: 'WITHDRAWING', purgeAfter: { lte: now } },
      include: { assets: { where: { status: 'ACTIVE' } } },
    });
    for (const talent of due) {
      for (const asset of talent.assets) await this.destroyAsset(asset);
      await this.prisma.talentProfile.update({
        where: { id: talent.id },
        data: { status: 'WITHDRAWN', withdrawnAt: now, livenessVerifiedAt: null },
      });
    }
    const expired = await this.prisma.castingContract.updateMany({
      where: { status: 'ACTIVE', endsAt: { lte: now }, ...(onlyTalentIds ? { talentId: { in: onlyTalentIds } } : {}) },
      data: { status: 'EXPIRED' },
    });
    return { withdrawnAccounts: leftAccounts.length, purgedTalents: due.length, expiredContracts: expired.count };
  }

  // --- 보호자 (7장) -------------------------------------------------------------

  async guardianConsent(guardian: TalentUser, talentId: string): Promise<WardDto> {
    const identity = await this.prisma.identityVerification.findUnique({ where: { userId: guardian.id } });
    if (!identity) throw new BadRequestException('보호자도 본인인증을 먼저 해야 합니다');
    if (isMinorAt(identity, new Date())) throw new ForbiddenException('보호자는 성인이어야 합니다');
    const profile = await this.prisma.talentProfile.findFirst({ where: { id: talentId, guardianEmail: guardian.email.toLowerCase() } });
    if (!profile) throw new NotFoundException('대리할 출연자를 찾을 수 없습니다');
    if (profile.guardianId && profile.guardianId !== guardian.id) throw new ConflictException('다른 보호자가 이미 연결되어 있습니다');
    await this.prisma.talentProfile.update({ where: { id: talentId }, data: { guardianId: guardian.id, guardianConsentAt: new Date() } });
    await this.refreshStatus(talentId);
    return toWardDto(await this.prisma.talentProfile.findUniqueOrThrow({ where: { id: talentId } }));
  }

  async wards(guardian: TalentUser): Promise<WardDto[]> {
    const rows = await this.prisma.talentProfile.findMany({
      where: { OR: [{ guardianId: guardian.id }, { guardianEmail: guardian.email.toLowerCase() }] },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toWardDto);
  }

  /** 관리자: 가족관계증명서 등으로 보호자 관계를 확인했다고 표시한다 */
  async verifyGuardianRelationship(talentId: string): Promise<WardDto> {
    const profile = await this.prisma.talentProfile.findUnique({ where: { id: talentId } });
    if (!profile) throw new NotFoundException('출연자를 찾을 수 없습니다');
    if (!profile.guardianId) throw new ConflictException('아직 보호자가 연결되지 않았습니다');
    await this.prisma.talentProfile.update({ where: { id: talentId }, data: { guardianVerifiedAt: new Date() } });
    await this.refreshStatus(talentId);
    return toWardDto(await this.prisma.talentProfile.findUniqueOrThrow({ where: { id: talentId } }));
  }

  /** 관리자: 보호자 관계 확인을 기다리는 미성년 출연자 */
  async pendingGuardianChecks(): Promise<WardDto[]> {
    const rows = await this.prisma.talentProfile.findMany({
      where: { guardianId: { not: null }, guardianConsentAt: { not: null }, guardianVerifiedAt: null },
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map(toWardDto);
  }

  // --- helpers ----------------------------------------------------------------

  /** 지금 캐스팅할 수 있는지 (시간에 따라 바뀌므로 매번 다시 계산한다) */
  async castable(talentId: string, now = new Date()) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      include: { ...PROFILE_INCLUDE, user: { select: { identity: true, status: true } } },
    });
    if (!profile) return null;
    const missing = stepsFor(profile, now);
    const isMinor = profile.user.identity ? isMinorAt(profile.user.identity, now) : false;
    const castable = profile.status === 'ACTIVE' && profile.user.status === 'ACTIVE' && missing.length === 0;
    return { profile, isMinor, castable, missing };
  }

  async refreshStatus(talentId: string): Promise<void> {
    const profile = await this.prisma.talentProfile.findUnique({ where: { id: talentId }, include: PROFILE_INCLUDE });
    if (!profile || profile.status === 'WITHDRAWING' || profile.status === 'WITHDRAWN') return;
    const status = stepsFor(profile).length === 0 ? 'ACTIVE' : 'PENDING_VERIFICATION';
    if (status !== profile.status) await this.prisma.talentProfile.update({ where: { id: talentId }, data: { status } });
  }

  private async destroyAsset(asset: LikenessAsset) {
    await this.vault.destroy(asset.storageKey);
    await this.prisma.likenessAsset.update({
      where: { id: asset.id },
      data: { status: 'DELETED', wrappedKey: null, deletedAt: new Date() },
    });
  }

  private async ownProfile(user: TalentUser): Promise<ProfileWithRelations> {
    const profile = await this.prisma.talentProfile.findUnique({ where: { userId: user.id }, include: PROFILE_INCLUDE });
    if (!profile) throw new NotFoundException('출연자 프로필을 먼저 만들어 주세요');
    return profile;
  }

  private assertNotWithdrawing(profile: TalentProfile) {
    if (profile.status === 'WITHDRAWING' || profile.status === 'WITHDRAWN') {
      throw new ConflictException('등록을 철회한 상태입니다');
    }
  }
}
