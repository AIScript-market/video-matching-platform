-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'ABUSE', 'FRAUD', 'COPYRIGHT', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "AccountReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "scriptId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "AccountReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountReport_targetId_status_idx" ON "AccountReport"("targetId", "status");

-- CreateIndex
CREATE INDEX "AccountReport_status_createdAt_idx" ON "AccountReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccountReport_reporterId_targetId_status_idx" ON "AccountReport"("reporterId", "targetId", "status");

-- AddForeignKey
ALTER TABLE "AccountReport" ADD CONSTRAINT "AccountReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReport" ADD CONSTRAINT "AccountReport_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReport" ADD CONSTRAINT "AccountReport_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReport" ADD CONSTRAINT "AccountReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
