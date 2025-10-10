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

  constructor(config: WhatsAppClientConfig) {
    if (!config?.accessToken && !config?.kapsoApiKey) {
      throw new Error("Must provide either an accessToken or kapsoApiKey");
    }

    this.accessToken = config.accessToken;
    this.kapsoApiKey = config.kapsoApiKey;
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.graphVersion = config.graphVersion ?? DEFAULT_GRAPH_VERSION;
    this.kapsoProxy = detectKapsoProxy(this.baseUrl);
    this.fetchImpl = config.fetch ?? globalThis.fetch;

    if (typeof this.fetchImpl !== "function") {
      throw new Error("Global fetch API is not available. Please supply a custom fetch implementation.");
    }

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

    const response = await this.fetchImpl(url, init);

    if (responseType === "json") {
      return parseJsonResponse(response);
    }

    return response;
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

function detectKapsoProxy(baseUrl: string): boolean {
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
