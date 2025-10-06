export type KnownErrorCode =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 10
  | 33
  | 100
  | 190
  | 368
  | 429
  | 500
  | 80007
  | 130429
  | 130472
  | 130497
  | 131000
  | 131005
  | 131008
  | 131009
  | 131016
  | 131021
  | 131026
  | 131031
  | 131037
  | 131042
  | 131045
  | 131047
  | 131049
  | 131050
  | 131051
  | 131052
  | 131053
  | 131056
  | 131057
  | 132000
  | 132001
  | 132005
  | 132007
  | 132012
  | 132015
  | 132016
  | 132068
  | 132069
  | 133000
  | 133004
  | 133005
  | 133006
  | 133008
  | 133009
  | 133010
  | 133015
  | 133016
  | 134011
  | 135000
  | 2593107
  | 2593108;

export type ErrorCode = KnownErrorCode | number;

export type ErrorCategory =
  | "authorization"
  | "permission"
  | "parameter"
  | "throttling"
  | "template"
  | "media"
  | "phoneRegistration"
  | "integrity"
  | "businessEligibility"
  | "reengagementWindow"
  | "wabaConfig"
  | "flow"
  | "synchronization"
  | "server"
  | "unknown";

export type RetryAction = "retry" | "retry_after" | "fix_and_retry" | "do_not_retry" | "refresh_token";

export interface RetryHint {
  action: RetryAction;
  retryAfterMs?: number;
}

export interface GraphErrorData {
  messagingProduct?: "whatsapp" | string;
  details?: string;
  [key: string]: unknown;
}

export interface GraphErrorPayload {
  message?: string;
  type?: string;
  code?: ErrorCode;
  errorData?: GraphErrorData;
  errorSubcode?: number;
  fbtraceId?: string;
  [key: string]: unknown;
}

export interface GraphErrorEnvelope {
  error: GraphErrorPayload;
}

export interface GraphApiErrorParams extends GraphErrorPayload {
  httpStatus: number;
  category: ErrorCategory;
  retry: RetryHint;
  raw: unknown;
  details?: string;
  message: string;
  type: string;
  code: ErrorCode;
}
