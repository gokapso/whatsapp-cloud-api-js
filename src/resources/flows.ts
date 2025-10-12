import { WhatsAppClient } from "../client";
import {
  toFlowJsonWireCase,
  computeFlowJsonHash,
  fromFlowJsonWireCase,
  fromWireKeyName
} from "../utils/flow-json";
import { isPlainObject } from "../utils/case";

export interface CreateFlowOptions {
  wabaId: string;
  name: string;
  categories?: string[];
  flowJson: Record<string, unknown>;
  endpointUri?: string;
  publish?: boolean;
}

export interface FlowValidationPointer {
  path?: string;
  lineStart?: number;
  lineEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  [key: string]: unknown;
}

export interface FlowValidationError {
  error: string;
  errorType?: string;
  message?: string;
  lineStart?: number;
  lineEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  pointers?: FlowValidationPointer[];
  hint?: string;
  [key: string]: unknown;
}

export interface CreateFlowResponse {
  id: string;
  success: boolean;
  validationErrors?: FlowValidationError[];
}

export interface UpdateFlowAssetOptions {
  flowId: string;
  json?: Record<string, unknown>;
  file?: Blob | File | ArrayBuffer | ArrayBufferView;
  phoneNumberId?: string;
  businessAccountId?: string;
}

export interface DeployFlowOptions {
  name: string;
  wabaId: string;
  endpointUri?: string;
  publish?: boolean;
  preview?: boolean | { interactive?: boolean; params?: Record<string, unknown> };
  flowId?: string;
  categories?: string[];
  forceAssetUpload?: boolean;
}

export interface DeployResult {
  flowId: string;
  previewUrl?: string;
  validationErrors?: FlowValidationError[];
  versionId?: string;
}

interface CachedHash {
  hash: string;
}

export class FlowsResource {
  private readonly client: WhatsAppClient;
  private readonly lastDeployedHashes = new Map<string, CachedHash>();

  constructor(client: WhatsAppClient) {
    this.client = client;
  }

  /** Internal helper exposed for tests only. */
  __setLastDeployedHash(input: { key?: string; name: string; wabaId?: string; hash: string }): void {
    const key = input.key ?? this.buildCacheKey(input.wabaId ?? "", input.name);
    this.lastDeployedHashes.set(key, { hash: input.hash });
  }

  async create(options: CreateFlowOptions): Promise<CreateFlowResponse> {
    const { wabaId, name, categories, flowJson, publish, endpointUri } = options;
    const body: Record<string, unknown> = {
      name,
      categories: categories && categories.length > 0 ? categories : ["OTHER"],
      flow_json: JSON.stringify(toFlowJsonWireCase(flowJson))
    };
    if (publish !== undefined) body.publish = publish;
    if (endpointUri) body.endpoint_uri = endpointUri;

    const response = await this.client.request("POST", `/${wabaId}/flows`, {
      body,
      responseType: "json"
    }) as { id: string; success: boolean; validation_errors?: unknown; validationErrors?: unknown };

    return {
      id: response.id,
      success: response.success,
      validationErrors: normalizeValidationErrors(extractValidationErrors(response))
    };
  }

  async updateAsset(options: UpdateFlowAssetOptions): Promise<{ success: boolean; validationErrors?: FlowValidationError[] }> {
    const { flowId, json, file, phoneNumberId, businessAccountId } = options;
    if (!json && !file) {
      throw new Error("Must supply either json or file when updating a Flow asset");
    }

    const form = new FormData();

    if (json) {
      const payload = JSON.stringify(toFlowJsonWireCase(json));
      const blob = new Blob([payload], { type: "application/json" });
      form.append("file", blob, "flow.json");
    } else if (file instanceof Blob) {
      form.append("file", file, "flow.json");
    } else if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) {
      const buf = toStrictArrayBuffer(file);
      const blob = new Blob([buf], { type: "application/json" });
      form.append("file", blob, "flow.json");
    } else {
      throw new Error("Unsupported file type for Flow asset upload");
    }

    form.append("name", "flow.json");
    form.append("asset_type", "FLOW_JSON");

    const query: Record<string, unknown> = {};
    if (phoneNumberId) query.phoneNumberId = phoneNumberId;
    if (businessAccountId) query.businessAccountId = businessAccountId;

    const response = await this.client.request("POST", `/${flowId}/assets`, {
      body: form,
      query: Object.keys(query).length ? query : undefined,
      responseType: "json"
    }) as { success: boolean; validation_errors?: unknown; validationErrors?: unknown };

    return {
      success: response.success,
      validationErrors: normalizeValidationErrors(extractValidationErrors(response))
    };
  }

  async publish(options: { flowId: string; phoneNumberId?: string; businessAccountId?: string }): Promise<{ success: boolean }> {
    const { flowId, phoneNumberId, businessAccountId } = options;
    const query: Record<string, unknown> = {};
    if (phoneNumberId) query.phoneNumberId = phoneNumberId;
    if (businessAccountId) query.businessAccountId = businessAccountId;
    return this.client.request("POST", `/${flowId}/publish`, {
      query: Object.keys(query).length ? query : undefined,
      responseType: "json"
    }) as Promise<{ success: boolean }>;
  }

  async deprecate(options: { flowId: string; phoneNumberId?: string; businessAccountId?: string }): Promise<{ success: boolean }> {
    const { flowId, phoneNumberId, businessAccountId } = options;
    const query: Record<string, unknown> = {};
    if (phoneNumberId) query.phoneNumberId = phoneNumberId;
    if (businessAccountId) query.businessAccountId = businessAccountId;
    return this.client.request("POST", `/${flowId}/deprecate`, {
      query: Object.keys(query).length ? query : undefined,
      responseType: "json"
    }) as Promise<{ success: boolean }>;
  }

  async preview(options: { flowId: string; interactive?: boolean; fields?: string; params?: Record<string, unknown>; phoneNumberId?: string; businessAccountId?: string }): Promise<{ preview: { previewUrl: string; expiresAt: string } }> {
    const { flowId, interactive, fields, params, phoneNumberId, businessAccountId } = options;
    const resolvedFields = fields ?? (interactive ? "preview.invalidate(false)" : "preview");
    const queryParams: Record<string, unknown> = { fields: resolvedFields };
    if (params) Object.assign(queryParams, params);
    if (phoneNumberId) queryParams.phoneNumberId = phoneNumberId;
    if (businessAccountId) queryParams.businessAccountId = businessAccountId;

    const response = await this.client.request("GET", `/${flowId}`, {
      query: queryParams,
      responseType: "json"
    }) as { preview?: { preview_url?: string; expires_at?: string; previewUrl?: string; expiresAt?: string } };

    const preview = response.preview ?? { preview_url: "", expires_at: "" };
    return {
      preview: {
        previewUrl: preview.previewUrl ?? preview.preview_url ?? "",
        expiresAt: preview.expiresAt ?? preview.expires_at ?? ""
      }
    };
  }

  async get<T = unknown>(options: { flowId: string; fields?: string }): Promise<T> {
    return this.client.request("GET", `/${options.flowId}`, {
      query: options.fields ? { fields: options.fields } : undefined,
      responseType: "json"
    }) as Promise<T>;
  }

  async list<T = unknown>(options: { wabaId: string; limit?: number; after?: string }): Promise<T> {
    const { wabaId, limit, after } = options;
    const query: Record<string, unknown> = {};
    if (limit !== undefined) query.limit = limit;
    if (after) query.after = after;

    return this.client.request("GET", `/${wabaId}/flows`, {
      query,
      responseType: "json"
    }) as Promise<T>;
  }

  async deploy(flowJson: Record<string, unknown>, options: DeployFlowOptions): Promise<DeployResult> {
    const { name, wabaId, endpointUri, publish, preview, flowId: providedFlowId, categories, forceAssetUpload } = options;
    const cacheKey = this.buildCacheKey(wabaId, name);
    const hash = computeFlowJsonHash(flowJson);

    let flowId = providedFlowId;
    let validationErrors: FlowValidationError[] | undefined;

    if (!flowId) {
      const createResponse = await this.create({
        wabaId,
        name,
        categories,
        flowJson,
        endpointUri,
        publish: false
      });
      flowId = createResponse.id;
      validationErrors = createResponse.validationErrors;
      this.lastDeployedHashes.set(cacheKey, { hash });
    } else {
      const last = this.lastDeployedHashes.get(cacheKey);
      if (!last || last.hash !== hash || forceAssetUpload) {
        const update = await this.updateAsset({ flowId, json: flowJson });
        if (update.validationErrors?.length) {
          validationErrors = update.validationErrors;
        }
        this.lastDeployedHashes.set(cacheKey, { hash });
      }
    }

    if (!flowId) {
      throw new Error("Unable to resolve Flow ID after deployment");
    }

    if (publish) {
      await this.publish({ flowId });
    }

    let previewUrl: string | undefined;
    if (preview) {
      const previewOptions = typeof preview === "boolean" ? { interactive: preview } : preview;
      const previewResponse = await this.preview({
        flowId,
        interactive: previewOptions.interactive,
        params: previewOptions.params
      });
      previewUrl = previewResponse.preview.previewUrl || undefined;
    }

    return {
      flowId,
      previewUrl,
      validationErrors
    };
  }

  private buildCacheKey(wabaId: string, name: string): string {
    return `${wabaId}::${name}`;
  }
}

function toStrictArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const src = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy.buffer;
}

function normalizeValidationErrors(input: unknown): FlowValidationError[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const normalized: FlowValidationError[] = [];

  for (const candidate of input) {
    if (!isPlainObject(candidate)) continue;

    const errorCode = candidate.error;
    const entry: FlowValidationError = {
      error: typeof errorCode === "string" ? errorCode : String(errorCode ?? "")
    };

    for (const [key, value] of Object.entries(candidate)) {
      if (key === "error") continue;
      if (key === "error_type") {
        entry.errorType = typeof value === "string" ? value : String(value);
        continue;
      }
      if (key === "pointers" && Array.isArray(value)) {
        entry.pointers = value
          .filter(isPlainObject)
          .map((pointer) => mapPointer(pointer as Record<string, unknown>));
        continue;
      }

      const camelKey = fromWireKeyName(key);
      (entry as Record<string, unknown>)[camelKey] = value;
    }

    const hint = deriveHint(entry.pointers);
    if (hint) entry.hint = hint;

    normalized.push(entry);
  }

  return normalized.length > 0 ? normalized : undefined;
}

function mapPointer(pointer: Record<string, unknown>): FlowValidationPointer {
  const result: FlowValidationPointer = {};
  for (const [key, value] of Object.entries(pointer)) {
    if (key === "path") {
      result.path = typeof value === "string" ? value : String(value);
      continue;
    }
    const camelKey = fromWireKeyName(key);
    (result as Record<string, unknown>)[camelKey] = value;
  }
  return result;
}

function deriveHint(pointers?: FlowValidationPointer[]): string | undefined {
  if (!pointers) return undefined;
  for (const pointer of pointers) {
    const path = pointer.path;
    if (!path) continue;
    const match = path.match(/([A-Za-z0-9_-]+)(?!.*[A-Za-z0-9_-])/);
    if (!match) continue;
    const segment = match[1];
    if (!segment.includes("-") && !segment.includes("_")) continue;
    const camel = fromWireKeyName(segment);
    if (camel === segment) continue;
    return `Use ${camel} (camelCase). We map it to ${segment}.`;
  }
  return undefined;
}

function extractValidationErrors(source: Record<string, unknown>): unknown {
  if ("validation_errors" in source && (source as Record<string, unknown>).validation_errors !== undefined) {
    return (source as Record<string, unknown>).validation_errors;
  }
  if ("validationErrors" in source && (source as Record<string, unknown>).validationErrors !== undefined) {
    return (source as Record<string, unknown>).validationErrors;
  }
  return undefined;
}
