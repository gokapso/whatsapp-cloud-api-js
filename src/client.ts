import { MessagesResource } from "./resources/messages";
import { MediaResource } from "./resources/media";
import { TemplatesResource } from "./resources/templates";
import { PhoneNumbersResource } from "./resources/phone-numbers";
import { parseJsonResponse } from "./resources/shared";
import { toSnakeCaseDeep } from "./utils/case";
import { CallsResource } from "./resources/calls";
import { ConversationsResource } from "./resources/conversations";
import { ContactsResource } from "./resources/contacts";
import { FlowsResource } from "./resources/flows";
import { GraphApiError, type RetryHint } from "./errors";

/**
 * Configuration for automatic retry behavior.
 * @category Client
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds for exponential backoff (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
  /** Whether retry is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Configuration for {@link WhatsAppClient}.
 * @category Client
 */
export interface WhatsAppClientConfig {
  /** Meta access token used for Graph API calls */
  accessToken?: string;
  /** Kapso API key used when routing through the Kapso proxy */
  kapsoApiKey?: string;
  /** Base URL to use instead of the Meta Graph API */
  baseUrl?: string;
  /** Graph API version (default: v23.0) */
  graphVersion?: string;
  /** Custom fetch implementation (useful for tests and non-Node runtimes) */
  fetch?: typeof fetch;
  /** Configuration for automatic retry behavior */
  retry?: RetryConfig;
}

/** Options for {@link WhatsAppClient.request}. @category Client */
export interface RequestOptions {
  /** Query parameters appended to the request */
  query?: Record<string, unknown>;
  /** Request body. Objects are serialized as JSON. */
  body?: BodyInit | Record<string, unknown> | null;
  /** Additional headers to merge with auth headers */
  headers?: Record<string, string>;
  /** When set to "json", returns a parsed JSON body typed as the generic. */
  responseType?: "json";
}

const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v23.0";

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [429, 500, 502, 503, 504],
  enabled: true,
};

/**
 * Minimal, fetch-based client for the WhatsApp Business Cloud API.
 *
 * - Supports calling Meta Graph directly or via Kapso proxy (set {@link WhatsAppClientConfig.baseUrl} and {@link WhatsAppClientConfig.kapsoApiKey}).
 * - All resource helpers (messages, media, templates, phone-numbers) hang off this client.
 * @category Client
 */
export class WhatsAppClient {
  public readonly messages: MessagesResource;
  public readonly media: MediaResource;
  public readonly templates: TemplatesResource;
  public readonly phoneNumbers: PhoneNumbersResource;
  public readonly calls: CallsResource;
  public readonly conversations: ConversationsResource;
  public readonly contacts: ContactsResource;
  public readonly flows: FlowsResource;
  private readonly accessToken?: string;
  private readonly kapsoApiKey?: string;
  private readonly baseUrl: string;
  private readonly graphVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly kapsoProxy: boolean;
  private readonly retryConfig: Required<RetryConfig>;

  constructor(config: WhatsAppClientConfig) {
    if (!config?.accessToken && !config?.kapsoApiKey) {
      throw new Error("Must provide either an accessToken or kapsoApiKey");
    }

    this.accessToken = config.accessToken;
    this.kapsoApiKey = config.kapsoApiKey;
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.graphVersion = config.graphVersion ?? DEFAULT_GRAPH_VERSION;
    this.kapsoProxy = detectKapsoProxy(this.baseUrl, this.kapsoApiKey);
    this.fetchImpl = config.fetch ?? globalThis.fetch;

    if (typeof this.fetchImpl !== "function") {
      throw new Error("Global fetch API is not available. Please supply a custom fetch implementation.");
    }

    // Initialize retry config with defaults
    const userRetryConfig = config.retry ?? {};
    this.retryConfig = {
      maxAttempts: userRetryConfig.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
      initialDelayMs: userRetryConfig.initialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs,
      maxDelayMs: userRetryConfig.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
      retryableStatuses: userRetryConfig.retryableStatuses ?? DEFAULT_RETRY_CONFIG.retryableStatuses,
      enabled: userRetryConfig.enabled ?? DEFAULT_RETRY_CONFIG.enabled,
    };

    this.messages = new MessagesResource(this);
    this.media = new MediaResource(this);
    this.templates = new TemplatesResource(this);
    this.phoneNumbers = new PhoneNumbersResource(this);
    this.calls = new CallsResource(this);
    this.conversations = new ConversationsResource(this);
    this.contacts = new ContactsResource(this);
    this.flows = new FlowsResource(this);
  }

  isKapsoProxy(): boolean {
    return this.kapsoProxy;
  }

  /**
   * Determines if an error should be retried based on the error's retry hint and configuration.
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    if (!this.retryConfig.enabled) {
      return false;
    }

    if (attempt >= this.retryConfig.maxAttempts) {
      return false;
    }

    if (!(error instanceof GraphApiError)) {
      return false;
    }

    const { retry, httpStatus } = error;

    if (retry.action === "do_not_retry") {
      return false;
    }

    if (retry.action === "refresh_token") {
      return false;
    }

    if (this.retryConfig.retryableStatuses.includes(httpStatus)) {
      return true;
    }

    if (retry.action === "retry_after") {
      return true;
    }

    if (retry.action === "retry" && httpStatus >= 500) {
      return true;
    }

    return false;
  }

  /**
   * Calculates the delay before the next retry attempt using exponential backoff with jitter.
   * Respects server-provided retryAfterMs when available.
   */
  private calculateBackoffDelay(attempt: number, retryHint?: RetryHint): number {
    if (retryHint?.retryAfterMs !== undefined) {
      return Math.min(retryHint.retryAfterMs, this.retryConfig.maxDelayMs);
    }

    const exponentialDelay = this.retryConfig.initialDelayMs * Math.pow(2, attempt);

    const jitter = Math.random() * 0.3 * exponentialDelay;

    const totalDelay = exponentialDelay + jitter;
    return Math.min(totalDelay, this.retryConfig.maxDelayMs);
  }

  /** Perform an HTTP request and parse JSON into type T. */
  async request<T>(method: string, path: string, options: RequestOptions & { responseType: "json" }): Promise<T>;
  /** Perform an HTTP request and return the raw Response. */
  async request(method: string, path: string, options?: RequestOptions): Promise<Response>;
  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    const { responseType, query, headers: headerOverrides, body } = options;

    const url = this.buildUrl(path, query);
    const headers = this.buildHeaders(headerOverrides);
    const init: RequestInit = {
      method: method.toUpperCase(),
      headers
    };

    if (body !== undefined && body !== null) {
      if (
        isFormData(body) ||
        isBlob(body) ||
        body instanceof URLSearchParams ||
        typeof body === "string" ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body)
      ) {
        init.body = body as BodyInit;
      } else {
        const payload = toSnakeCaseDeep(body);
        init.body = JSON.stringify(payload);
        if (!("Content-Type" in headers)) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    // Retry logic
    let lastError: unknown;
    let attempt = 0;

    while (attempt < this.retryConfig.maxAttempts) {
      try {
        const response = await this.fetchImpl(url, init);

        if (responseType === "json") {
          return parseJsonResponse(response);
        }

        return response;
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (!this.shouldRetry(error, attempt + 1)) {
          throw error;
        }

        attempt++;

        // Calculate delay and wait before retrying
        const retryHint = error instanceof GraphApiError ? error.retry : undefined;
        const delay = this.calculateBackoffDelay(attempt - 1, retryHint);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Perform a raw fetch to an absolute URL while automatically attaching the client's auth headers.
   * This does not modify the URL or payload (no base URL or version prefixing, no case conversion).
   */
  async fetch(url: string | URL, init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {}): Promise<Response> {
    const { headers: headerOverrides, ...rest } = init;
    const headers = this.buildHeaders(headerOverrides);
    const abs = typeof url === "string" ? url : url.toString();
    return this.fetchImpl(abs, { ...rest, headers });
  }

  /**
   * Perform a raw fetch WITHOUT attaching auth headers.
   * Useful for downloading media from public CDNs that reject Authorization headers.
   */
  async rawFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const abs = typeof url === "string" ? url : url.toString();
    return this.fetchImpl(abs, init);
  }

  private buildHeaders(overrides?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    if (this.kapsoApiKey) {
      headers["X-API-Key"] = this.kapsoApiKey;
    }

    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined && value !== null) {
          headers[key] = value;
        }
      }
    }

    return headers;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const cleanedPath = stripLeadingSlash(path);
    const base = `${this.baseUrl}/${this.graphVersion}/`;
    const url = new URL(cleanedPath, ensureTrailingSlash(base));

    if (query) {
      const normalizedQuery = toSnakeCaseDeep(query);
      for (const [key, value] of Object.entries(normalizedQuery)) {
        if (value === undefined || value === null) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== undefined && item !== null) {
              url.searchParams.append(key, String(item));
            }
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }
}

function stripLeadingSlash(input: string): string {
  return input.replace(/^\/+/, "");
}

function ensureTrailingSlash(input: string): string {
  return input.endsWith("/") ? input : `${input}/`;
}

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

function detectKapsoProxy(baseUrl: string, kapsoApiKey?: string): boolean {
  if (typeof kapsoApiKey === "string" && kapsoApiKey.length > 0) {
    return true;
  }

  try {
    const url = new URL(baseUrl);
    return url.hostname.endsWith("kapso.ai");
  } catch {
    return false;
  }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}
