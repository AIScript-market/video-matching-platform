-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CoinTxType" AS ENUM ('SIGNUP_BONUS', 'PURCHASE', 'SPEND', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "CoinUse" AS ENUM ('MESSAGE', 'PREVIEW_UNLOCK', 'SCRIPT_UPLOAD');

-- DropForeignKey
ALTER TABLE "RoleRequest" DROP CONSTRAINT "RoleRequest_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "RoleRequest" DROP CONSTRAINT "RoleRequest_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "coinBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profilePublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "RoleRequest";

-- DropEnum
DROP TYPE "RoleRequestStatus";

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CoinTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "use" "CoinUse",
    "refId" TEXT,
    "priceKrw" INTEGER,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptPreviewUnlock" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptPreviewUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTransaction_createdAt_idx" ON "CoinTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptPreviewUnlock_scriptId_userId_key" ON "ScriptPreviewUnlock"("scriptId", "userId");

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptPreviewUnlock" ADD CONSTRAINT "ScriptPreviewUnlock_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptPreviewUnlock" ADD CONSTRAINT "ScriptPreviewUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 계정 종류를 일반/관리자 두 가지로 정리: 기존 대본 제공자·영상 제작자 역할 제거
UPDATE "User" SET "roles" = array_remove(array_remove("roles", 'WRITER'::"Role"), 'PRODUCER'::"Role");
