-- CreateEnum
CREATE TYPE "TalentKind" AS ENUM ('ACTOR', 'GENERAL');

-- CreateEnum
CREATE TYPE "TalentStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'WITHDRAWING', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContentTag" AS ENUM ('ROMANCE', 'INTIMACY', 'VIOLENCE', 'HORROR', 'DEATH', 'SUBSTANCE', 'PROFANITY');

-- CreateEnum
CREATE TYPE "LikenessAssetKind" AS ENUM ('FACE_SCAN', 'VOICE', 'MOTION');

-- CreateEnum
CREATE TYPE "LikenessAssetStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "CastingRoleStatus" AS ENUM ('OPEN', 'CAST', 'CLOSED');

-- CreateEnum
CREATE TYPE "CastingSide" AS ENUM ('STUDIO', 'TALENT');

-- CreateEnum
CREATE TYPE "CastingNegotiationStatus" AS ENUM ('OPEN', 'AGREED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('FLAT', 'PER_EPISODE', 'REVENUE_SHARE', 'HYBRID');

-- CreateEnum
CREATE TYPE "UsageScope" AS ENUM ('DIGITAL', 'LIVE', 'BOTH');

-- CreateEnum
CREATE TYPE "CastingOfferStatus" AS ENUM ('PROPOSED', 'COUNTERED', 'WITHDRAWN', 'PENDING_GUARDIAN', 'REJECTED_BY_GUARDIAN', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "CastingContractStatus" AS ENUM ('ACTIVE', 'TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNLISTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "TakedownReason" AS ENUM ('OUT_OF_SCOPE', 'PROHIBITED_CONTENT', 'NOT_APPROVED', 'IDENTITY_FRAUD', 'MINOR_PROTECTION', 'PERSONALITY_HARM', 'PERSONAL_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TakedownStatus" AS ENUM ('OPEN', 'UPHELD', 'REJECTED', 'SETTLED');

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "isMinor" BOOLEAN NOT NULL,
    "adultOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TalentKind" NOT NULL,
    "stageName" TEXT NOT NULL,
    "bio" TEXT,
    "status" "TalentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "allowedTags" "ContentTag"[],
    "minFeeKrw" INTEGER NOT NULL DEFAULT 0,
    "livenessVerifiedAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "consentedAt" TIMESTAMP(3),
    "guardianEmail" TEXT,
    "guardianId" TEXT,
    "guardianConsentAt" TIMESTAMP(3),
    "guardianVerifiedAt" TIMESTAMP(3),
    "withdrawRequestedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LikenessAsset" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "kind" "LikenessAssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "wrappedKey" TEXT,
    "status" "LikenessAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LikenessAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LikenessAccessLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT,
    "purpose" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikenessAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isMinorRole" BOOLEAN NOT NULL DEFAULT false,
    "contentTags" "ContentTag"[],
    "status" "CastingRoleStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastingRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingNegotiation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "initiatedBy" "CastingSide" NOT NULL,
    "message" TEXT,
    "status" "CastingNegotiationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CastingNegotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingOffer" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "side" "CastingSide" NOT NULL,
    "feeType" "FeeType" NOT NULL,
    "flatFeeKrw" INTEGER NOT NULL DEFAULT 0,
    "perEpisodeFeeKrw" INTEGER NOT NULL DEFAULT 0,
    "episodes" INTEGER,
    "revenueSharePct" INTEGER NOT NULL DEFAULT 0,
    "usage" "UsageScope" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "exclusive" BOOLEAN NOT NULL,
    "requiresTalentApproval" BOOLEAN NOT NULL DEFAULT true,
    "productionDays" INTEGER NOT NULL,
    "earlyTerminationPct" INTEGER NOT NULL DEFAULT 50,
    "note" TEXT,
    "status" "CastingOfferStatus" NOT NULL DEFAULT 'PROPOSED',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingContract" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "feeType" "FeeType" NOT NULL,
    "flatFeeKrw" INTEGER NOT NULL,
    "perEpisodeFeeKrw" INTEGER NOT NULL,
    "episodes" INTEGER,
    "revenueSharePct" INTEGER NOT NULL,
    "usage" "UsageScope" NOT NULL,
    "contentTags" "ContentTag"[],
    "exclusive" BOOLEAN NOT NULL,
    "requiresTalentApproval" BOOLEAN NOT NULL,
    "earlyTerminationPct" INTEGER NOT NULL,
    "guardianApprovedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "productionEndsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "CastingContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentTags" "ContentTag"[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "externalUrl" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAppearance" (
    "workId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "WorkAppearance_pkey" PRIMARY KEY ("workId","contractId")
);

-- CreateTable
CREATE TABLE "TakedownRequest" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "reason" "TakedownReason" NOT NULL,
    "details" TEXT NOT NULL,
    "interimUnlisted" BOOLEAN NOT NULL,
    "status" "TakedownStatus" NOT NULL DEFAULT 'OPEN',
    "reviewDueAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakedownRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_userId_key" ON "IdentityVerification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfile_userId_key" ON "TalentProfile"("userId");

-- CreateIndex
CREATE INDEX "TalentProfile_status_idx" ON "TalentProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LikenessAsset_storageKey_key" ON "LikenessAsset"("storageKey");

-- CreateIndex
CREATE INDEX "LikenessAsset_talentId_status_idx" ON "LikenessAsset"("talentId", "status");

-- CreateIndex
CREATE INDEX "LikenessAccessLog_assetId_accessedAt_idx" ON "LikenessAccessLog"("assetId", "accessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_dealId_key" ON "Project"("dealId");

-- CreateIndex
CREATE INDEX "CastingRole_status_idx" ON "CastingRole"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CastingNegotiation_roleId_talentId_key" ON "CastingNegotiation"("roleId", "talentId");

-- CreateIndex
CREATE INDEX "CastingOffer_negotiationId_createdAt_idx" ON "CastingOffer"("negotiationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CastingContract_negotiationId_key" ON "CastingContract"("negotiationId");

-- CreateIndex
CREATE UNIQUE INDEX "CastingContract_offerId_key" ON "CastingContract"("offerId");

-- CreateIndex
CREATE INDEX "CastingContract_talentId_status_idx" ON "CastingContract"("talentId", "status");

-- CreateIndex
CREATE INDEX "TakedownRequest_status_createdAt_idx" ON "TakedownRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikenessAsset" ADD CONSTRAINT "LikenessAsset_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikenessAccessLog" ADD CONSTRAINT "LikenessAccessLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LikenessAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikenessAccessLog" ADD CONSTRAINT "LikenessAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikenessAccessLog" ADD CONSTRAINT "LikenessAccessLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CastingContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingRole" ADD CONSTRAINT "CastingRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingNegotiation" ADD CONSTRAINT "CastingNegotiation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CastingRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingNegotiation" ADD CONSTRAINT "CastingNegotiation_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingOffer" ADD CONSTRAINT "CastingOffer_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "CastingNegotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingOffer" ADD CONSTRAINT "CastingOffer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingContract" ADD CONSTRAINT "CastingContract_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "CastingNegotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingContract" ADD CONSTRAINT "CastingContract_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CastingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingContract" ADD CONSTRAINT "CastingContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingContract" ADD CONSTRAINT "CastingContract_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CastingRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingContract" ADD CONSTRAINT "CastingContract_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "TalentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAppearance" ADD CONSTRAINT "WorkAppearance_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAppearance" ADD CONSTRAINT "WorkAppearance_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CastingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakedownRequest" ADD CONSTRAINT "TakedownRequest_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakedownRequest" ADD CONSTRAINT "TakedownRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakedownRequest" ADD CONSTRAINT "TakedownRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
