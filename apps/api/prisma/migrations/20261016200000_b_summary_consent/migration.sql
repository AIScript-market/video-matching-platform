-- AI 요약은 작가가 동의한 대본만 만들고, 작가가 공개하기 전에는 작가와 열람 승인된 제작자만 본다
-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "aiSummaryConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSummaryConsentAt" TIMESTAMP(3),
ADD COLUMN     "aiSummaryPublic" BOOLEAN NOT NULL DEFAULT false;

-- 이미 요약이 있는 대본은 예전 방식(공개하면 자동 요약)으로 만든 것이므로 동의한 것으로 두되, 공개는 작가가 다시 정한다
UPDATE "Script" SET "aiSummaryConsent" = true, "aiSummaryConsentAt" = "createdAt" WHERE "aiSummary" IS NOT NULL;
