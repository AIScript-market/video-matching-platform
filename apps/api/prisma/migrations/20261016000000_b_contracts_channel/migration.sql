-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('NDA', 'SCRIPT_LICENSE', 'CHANNEL_PUBLISHING');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('AWAITING_SIGNATURES', 'SIGNED', 'VOID');

-- CreateEnum
CREATE TYPE "ContractPartyRole" AS ENUM ('WRITER', 'PRODUCER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ChannelVideoStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REMOVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "kind" "ContractKind" NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURES',
    "dealId" TEXT,
    "accessRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "role" "ContractPartyRole" NOT NULL,
    "userId" TEXT,
    "legalName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelVideo" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "rightsChecklist" JSONB NOT NULL,
    "status" "ChannelVideoStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "channelName" TEXT,
    "youtubeVideoId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRevenue" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "memo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementPayout" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "role" "ContractPartyRole" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SettlementPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_dealId_key" ON "Contract"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_accessRequestId_key" ON "Contract"("accessRequestId");

-- CreateIndex
CREATE INDEX "Contract_kind_status_idx" ON "Contract"("kind", "status");

-- CreateIndex
CREATE INDEX "ContractParty_userId_idx" ON "ContractParty"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractParty_contractId_role_key" ON "ContractParty"("contractId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelVideo_youtubeVideoId_key" ON "ChannelVideo"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "ChannelVideo_dealId_idx" ON "ChannelVideo"("dealId");

-- CreateIndex
CREATE INDEX "ChannelVideo_status_idx" ON "ChannelVideo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRevenue_videoId_month_key" ON "VideoRevenue"("videoId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementPayout_revenueId_role_key" ON "SettlementPayout"("revenueId", "role");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "ScriptAccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelVideo" ADD CONSTRAINT "ChannelVideo_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelVideo" ADD CONSTRAINT "ChannelVideo_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelVideo" ADD CONSTRAINT "ChannelVideo_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevenue" ADD CONSTRAINT "VideoRevenue_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "ChannelVideo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevenue" ADD CONSTRAINT "VideoRevenue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayout" ADD CONSTRAINT "SettlementPayout_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "VideoRevenue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayout" ADD CONSTRAINT "SettlementPayout_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayout" ADD CONSTRAINT "SettlementPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

