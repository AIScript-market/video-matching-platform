-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('FULL', 'PREVIEW');

-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "aiSummaryRequestedAt" TIMESTAMP(3),
ADD COLUMN     "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "previewText" TEXT;

-- AlterTable
ALTER TABLE "ScriptUpload" ADD COLUMN     "kind" "UploadKind" NOT NULL DEFAULT 'FULL';
