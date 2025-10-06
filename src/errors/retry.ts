import type { ErrorCategory, ErrorCode, RetryHint } from "./types";

const DO_NOT_RETRY_CODES = new Set<ErrorCode>([
  131049,
  131050,
  131047,
  368,
  130497,
  131031
]);

const REFRESH_TOKEN_CODES = new Set<ErrorCode>([0, 190]);

interface RetryParams {
  category: ErrorCategory;
  code?: number;
  httpStatus: number;
  retryAfterMs?: number;
}

export function deriveRetryHint({ category, code, httpStatus, retryAfterMs }: RetryParams): RetryHint {
  if (typeof retryAfterMs === "number") {
    return { action: "retry_after", retryAfterMs };
  }

  if (typeof code === "number" && DO_NOT_RETRY_CODES.has(code)) {
    return { action: "do_not_retry" };
  }

  switch (category) {
    case "authorization":
      return { action: "refresh_token" };
    case "throttling":
      return { action: "retry_after" };
    case "integrity":
      return { action: "do_not_retry" };
    case "reengagementWindow":
      return { action: "do_not_retry" };
    case "businessEligibility":
    case "phoneRegistration":
    case "wabaConfig":
    case "template":
    case "media":
    case "permission":
    case "parameter":
    case "flow":
    case "synchronization":
      return { action: "fix_and_retry" };
    case "server":
      return httpStatus >= 500 ? { action: "retry" } : { action: "fix_and_retry" };
    case "unknown":
    default:
      return httpStatus >= 500 ? { action: "retry" } : { action: "fix_and_retry" };
  }
}

export function shouldRefreshToken(code?: number): boolean {
  return typeof code === "number" && REFRESH_TOKEN_CODES.has(code as ErrorCode);
}
