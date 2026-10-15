-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "trainingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainingConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkPerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL,
    "watchTimeMinutes" INTEGER,
    "avgViewDurationSec" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "subscribersGained" INTEGER,
    "revenueKrw" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkPerformanceSnapshot_workId_capturedAt_idx" ON "WorkPerformanceSnapshot"("workId", "capturedAt");

-- AddForeignKey
ALTER TABLE "WorkPerformanceSnapshot" ADD CONSTRAINT "WorkPerformanceSnapshot_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPerformanceSnapshot" ADD CONSTRAINT "WorkPerformanceSnapshot_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
