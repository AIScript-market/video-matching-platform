import type { Schemas } from "@/lib/api";

export type InquirySummary = Schemas["InquirySummaryDto"];
export type InquiryDetail = Schemas["InquiryDetailDto"];

export const INQUIRY_CATEGORY: Record<InquirySummary["category"], string> = {
  ACCOUNT: "가입·계정",
  COINS: "코인",
  SCRIPTS: "대본·비밀유지",
  CONTRACTS: "계약·수익",
  VIDEOS: "영상 게시",
  OTHER: "기타",
};

export const INQUIRY_STATUS: Record<InquirySummary["status"], string> = {
  OPEN: "답변 대기",
  ANSWERED: "답변 완료",
  CLOSED: "해결됨",
};

/** 볼 수 없는 비밀 문의는 API가 작성자를 null로 가린다 */
export const isReadable = (q: InquirySummary) => q.authorName !== null;
