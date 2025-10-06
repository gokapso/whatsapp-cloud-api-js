import { toCamelCaseDeep } from "../utils/case";
import { categorizeErrorCode } from "./categorize";
import { deriveRetryHint, shouldRefreshToken } from "./retry";
import type { ErrorCategory, ErrorCode, GraphApiErrorParams, GraphErrorEnvelope, GraphErrorPayload, RetryHint } from "./types";

export class GraphApiError extends Error {
  readonly httpStatus: number;
  readonly code: ErrorCode;
  readonly type: string;
  readonly details?: string;
  readonly errorSubcode?: number;
  readonly fbtraceId?: string;
  readonly errorData?: GraphErrorPayload["errorData"];
  readonly category: ErrorCategory;
  readonly retry: RetryHint;
  readonly raw: unknown;

  constructor(params: GraphApiErrorParams) {
    super(params.message);
    this.name = "GraphApiError";
    this.httpStatus = params.httpStatus;
    this.code = params.code;
    this.type = params.type;
    this.details = params.details;
    this.errorSubcode = params.errorSubcode;
    this.fbtraceId = params.fbtraceId;
    this.errorData = params.errorData;
    this.category = params.category;
    this.retry = params.retry;
    this.raw = params.raw;
  }

  static fromResponse(response: Response, body: unknown, rawText?: string): GraphApiError {
    const httpStatus = response.status;
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    const camelBody = typeof body === "object" && body !== null ? toCamelCaseDeep(body) : body;

    if (isGraphErrorEnvelope(camelBody)) {
      const errorPayload = camelBody.error;
      const code = typeof errorPayload.code === "number" ? errorPayload.code : httpStatus;
      const type = errorPayload.type ?? GraphApiError.name;
      const details = typeof errorPayload.errorData?.details === "string" ? errorPayload.errorData.details : undefined;
      const category = categorizeErrorCode(
        typeof errorPayload.code === "number" ? errorPayload.code : undefined,
        httpStatus
      );
      const retry = deriveRetryHint({
        category,
        code: typeof errorPayload.code === "number" ? errorPayload.code : undefined,
        httpStatus,
        retryAfterMs
      });
      const message = errorPayload.message ?? defaultMessage(httpStatus, details, rawText);

      return new GraphApiError({
        message,
        httpStatus,
        code,
        type,
        details,
        errorSubcode: errorPayload.errorSubcode,
        fbtraceId: errorPayload.fbtraceId,
        errorData: errorPayload.errorData,
        category,
        retry,
        raw: camelBody
      });
    }

    if (camelBody && typeof camelBody === "object" && "error" in camelBody) {
      const { error } = camelBody as { error: unknown };
      const errorMessage = typeof error === "string" ? error : defaultMessage(httpStatus, undefined, rawText);
      const category = httpStatus >= 500 ? "server" : categorizeErrorCode(undefined, httpStatus);
      const retry = deriveRetryHint({ category, httpStatus, code: httpStatus, retryAfterMs });

      return new GraphApiError({
        message: errorMessage,
        httpStatus,
        code: httpStatus,
        type: GraphApiError.name,
        category,
        retry,
        raw: camelBody
      });
    }

    const category = httpStatus >= 500 ? "server" : categorizeErrorCode(undefined, httpStatus);
    const retry = deriveRetryHint({ category, httpStatus, code: httpStatus, retryAfterMs });
    const message = defaultMessage(httpStatus, undefined, rawText);

    return new GraphApiError({
      message,
      httpStatus,
      code: httpStatus,
      type: GraphApiError.name,
      category,
      retry,
      raw: rawText ?? body ?? null
    });
  }

  isAuthError(): boolean {
    return this.category === "authorization";
  }

  isRateLimit(): boolean {
    return this.category === "throttling";
  }

  isTemplateError(): boolean {
    return this.category === "template";
  }

  requiresTokenRefresh(): boolean {
    return (
      this.category === "authorization" ||
      shouldRefreshToken(typeof this.code === "number" ? this.code : undefined)
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      httpStatus: this.httpStatus,
      code: this.code,
      type: this.type,
      details: this.details,
      errorSubcode: this.errorSubcode,
      fbtraceId: this.fbtraceId,
      category: this.category,
      retry: this.retry,
      raw: this.raw
    };
  }
}

function isGraphErrorEnvelope(value: unknown): value is GraphErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Record<string, unknown>;
  const payload = envelope.error;
  return typeof payload === "object" && payload !== null;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const numeric = Number(header);
  if (!Number.isNaN(numeric)) {
    return Math.max(0, numeric) * 1000;
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : 0;
  }

  return undefined;
}

function defaultMessage(status: number, details?: string, rawText?: string): string {
  if (details) {
    return `Meta API request failed with status ${status}: ${details}`;
  }

  if (rawText && rawText.trim().length > 0) {
    return `Meta API request failed with status ${status}: ${rawText}`;
  }

  return `Meta API request failed with status ${status}`;
}
