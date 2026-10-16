-- AI 요약은 작가가 동의한 대본만 만든다 (공개 소개 글만 요약하고 전문은 보내지 않는다)
-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "aiSummaryConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSummaryConsentAt" TIMESTAMP(3);

-- 이미 요약이 있는 대본은 예전 방식(공개하면 자동 요약)으로 만든 것이므로 동의한 것으로 둔다
UPDATE "Script" SET "aiSummaryConsent" = true, "aiSummaryConsentAt" = "createdAt" WHERE "aiSummary" IS NOT NULL;
