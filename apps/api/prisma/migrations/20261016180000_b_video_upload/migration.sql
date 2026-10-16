-- 검수용 영상을 저장소에 직접 올릴 수 있게 한다 (링크 제출은 그대로 둔다)
-- AlterTable
ALTER TABLE "ChannelVideo" ADD COLUMN     "fileDeletedAt" TIMESTAMP(3),
ADD COLUMN     "fileKey" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSizeBytes" INTEGER,
ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- 링크와 파일 중 정확히 하나
ALTER TABLE "ChannelVideo" ADD CONSTRAINT "ChannelVideo_source_check" CHECK (("sourceUrl" IS NULL) <> ("fileKey" IS NULL));

-- CreateIndex
CREATE UNIQUE INDEX "ChannelVideo_fileKey_key" ON "ChannelVideo"("fileKey");
