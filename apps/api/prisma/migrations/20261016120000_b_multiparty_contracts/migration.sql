-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'SUPERSEDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractPartyRole" ADD VALUE 'PERFORMER';
ALTER TYPE "ContractPartyRole" ADD VALUE 'OTHER';

-- DropIndex
DROP INDEX "Contract_dealId_key";

-- DropIndex
DROP INDEX "ContractParty_contractId_role_key";

-- DropIndex
DROP INDEX "SettlementPayout_revenueId_role_key";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "effectiveMonth" TEXT,
ADD COLUMN     "supersedesId" TEXT;

-- AlterTable
ALTER TABLE "ContractParty" ADD COLUMN     "label" TEXT,
ADD COLUMN     "receivesRemainder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revenueShareBp" INTEGER;

-- AlterTable
ALTER TABLE "VideoRevenue" ADD COLUMN     "contractId" TEXT;

-- 기존 이용허락 계약(v0)의 당사자에 배분율을 채운다: 수락된 제안의 작가 %·제작자 %, 내림 차이는 제작자
UPDATE "ContractParty" cp
SET "revenueShareBp" = CASE cp."role" WHEN 'WRITER' THEN o."writerSharePct" * 100 ELSE o."producerSharePct" * 100 END,
    "receivesRemainder" = (cp."role" = 'PRODUCER')
FROM "Contract" c
JOIN "Deal" d ON d."id" = c."dealId"
JOIN "Offer" o ON o."id" = d."acceptedOfferId"
WHERE cp."contractId" = c."id" AND c."kind" = 'SCRIPT_LICENSE' AND cp."role" IN ('WRITER', 'PRODUCER');

-- 기존 수익 기록에 적용 계약을 채운다 (딜마다 계약이 하나뿐이던 때)
UPDATE "VideoRevenue" r
SET "contractId" = c."id"
FROM "ChannelVideo" v
JOIN "Contract" c ON c."dealId" = v."dealId" AND c."kind" = 'SCRIPT_LICENSE'
WHERE r."videoId" = v."id";

-- 지급 기록에 받은 당사자를 채운 뒤 필수로 바꾼다
ALTER TABLE "SettlementPayout" ADD COLUMN     "partyId" TEXT;
UPDATE "SettlementPayout" sp
SET "partyId" = cp."id"
FROM "VideoRevenue" r
JOIN "ContractParty" cp ON cp."contractId" = r."contractId"
WHERE sp."revenueId" = r."id" AND cp."role" = sp."role";
ALTER TABLE "SettlementPayout" ALTER COLUMN "partyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_supersedesId_key" ON "Contract"("supersedesId");

-- CreateIndex
CREATE INDEX "Contract_dealId_idx" ON "Contract"("dealId");

-- CreateIndex
CREATE INDEX "ContractParty_contractId_role_idx" ON "ContractParty"("contractId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ContractParty_contractId_userId_key" ON "ContractParty"("contractId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementPayout_revenueId_partyId_key" ON "SettlementPayout"("revenueId", "partyId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRevenue" ADD CONSTRAINT "VideoRevenue_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayout" ADD CONSTRAINT "SettlementPayout_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

