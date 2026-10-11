-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('OPEN', 'AGREED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PROPOSED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('PENDING_CONTRACT', 'ACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('REVENUE', 'PAYOUT', 'FEE', 'ADJUSTMENT');

-- AlterEnum
BEGIN;
CREATE TYPE "ScriptStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
ALTER TABLE "public"."Script" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Script" ALTER COLUMN "status" TYPE "ScriptStatus_new" USING ("status"::text::"ScriptStatus_new");
ALTER TYPE "ScriptStatus" RENAME TO "ScriptStatus_old";
ALTER TYPE "ScriptStatus_new" RENAME TO "ScriptStatus";
DROP TYPE "public"."ScriptStatus_old";
ALTER TABLE "Script" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_producerId_fkey";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_scriptId_fkey";

-- DropForeignKey
ALTER TABLE "Script" DROP CONSTRAINT "Script_writerId_fkey";

-- DropIndex
DROP INDEX "Script_status_createdAt_idx";

-- AlterTable
ALTER TABLE "Script" DROP COLUMN "content",
DROP COLUMN "summary",
DROP COLUMN "writerId",
ADD COLUMN     "aiSummary" JSONB,
ADD COLUMN     "authorId" TEXT NOT NULL,
ADD COLUMN     "fullText" TEXT NOT NULL,
ADD COLUMN     "rightsDeclared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rightsDeclaredAt" TIMESTAMP(3),
ADD COLUMN     "synopsis" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "bio",
DROP COLUMN "name",
DROP COLUMN "portfolioUrl",
DROP COLUMN "role",
DROP COLUMN "updatedAt",
ADD COLUMN     "displayName" TEXT NOT NULL,
ADD COLUMN     "roles" "Role"[];

-- DropTable
DROP TABLE "Proposal";

-- DropEnum
DROP TYPE "ProposalStatus";

-- CreateTable
CREATE TABLE "ScriptAccessRequest" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "ndaAcceptedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ScriptAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptAccessLog" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "writerId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "writerSharePct" INTEGER NOT NULL,
    "producerSharePct" INTEGER NOT NULL,
    "upfrontFeeKrw" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "exclusive" BOOLEAN NOT NULL,
    "notes" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "acceptedOfferId" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'PENDING_CONTRACT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "licenseeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "LicenseStatus" NOT NULL DEFAULT 'DRAFT',
    "terminationReason" TEXT,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "memo" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScriptAccessRequest_scriptId_producerId_key" ON "ScriptAccessRequest"("scriptId", "producerId");

-- CreateIndex
CREATE UNIQUE INDEX "Negotiation_scriptId_producerId_key" ON "Negotiation"("scriptId", "producerId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_negotiationId_key" ON "Deal"("negotiationId");

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptAccessRequest" ADD CONSTRAINT "ScriptAccessRequest_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptAccessRequest" ADD CONSTRAINT "ScriptAccessRequest_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptAccessLog" ADD CONSTRAINT "ScriptAccessLog_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptAccessLog" ADD CONSTRAINT "ScriptAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_writerId_fkey" FOREIGN KEY ("writerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_licenseeId_fkey" FOREIGN KEY ("licenseeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
