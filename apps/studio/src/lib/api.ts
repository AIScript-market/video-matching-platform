import createClient from "openapi-fetch";
import type { components, paths } from "./api-schema";

export type Schemas = components["schemas"];
export type ScriptSummary = Schemas["ScriptSummaryDto"];
export type ScriptDetail = Schemas["ScriptDetailDto"];
export type AccessRequest = Schemas["AccessRequestDto"];
export type Negotiation = Schemas["NegotiationDto"];
export type NegotiationDetail = Schemas["NegotiationDetailDto"];
export type Offer = Schemas["OfferDto"];
export type Message = Schemas["MessageDto"];
export type Deal = Schemas["DealDto"];
export type Ledger = Schemas["LedgerDto"];
export type Me = Schemas["MeDto"];
export type Role = Me["roles"][number];
export type Wallet = Schemas["WalletDto"];
export type CoinTransaction = Schemas["CoinTransactionDto"];
export type PublicProfile = Schemas["PublicProfileDto"];
export type PublicConfig = Schemas["PublicConfigDto"];
export type Contract = Schemas["ContractDto"];
export type ContractSummary = Schemas["ContractSummaryDto"];
export type ContractPreview = Schemas["ContractPreviewDto"];
export type ChannelVideo = Schemas["ChannelVideoDto"];
export type Settlement = Schemas["SettlementDto"];

/** API 오류. code로 화면이 상황별 안내(프로필 공개, 코인 충전 등)를 띄운다 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** 같은 출처의 /api 로 보내면 next.config.ts의 rewrite가 API 서버로 넘긴다 */
export const api = createClient<paths>({ baseUrl: "/api", credentials: "include" });

/** Nest 오류 응답 { message: string | string[] } 을 사람이 읽을 문장으로 */
export function errorMessage(error: unknown, fallback = "요청을 처리하지 못했습니다"): string {
  const message = (error as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message.join("\n");
  if (typeof message === "string") return message;
  return fallback;
}

/** openapi-fetch 결과에서 data를 꺼내고, 실패면 오류 메시지로 throw */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise;
  if (error !== undefined || !response.ok) {
    throw new ApiError(errorMessage(error), (error as { error?: string } | undefined)?.error, response.status);
  }
  return data as T;
}

export const UPLOAD_ACCEPT = ".txt,.md,.fountain,.docx,.pdf";

/** 대본 파일 업로드 (multipart). path 예: "/scripts/upload", "/scripts/{id}/upload" */
export async function uploadScriptFile(path: string, file: File): Promise<ScriptDetail> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api${path}`, { method: "POST", body: form, credentials: "include" });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(
      errorMessage(body, res.status === 413 ? "파일이 너무 큽니다 (최대 5MB)" : undefined),
      (body as { error?: string } | undefined)?.error,
      res.status,
    );
  }
  return body as ScriptDetail;
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
