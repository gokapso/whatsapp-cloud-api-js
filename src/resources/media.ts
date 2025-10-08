import type { Buffer } from "node:buffer";
import { z } from "zod";
import type { WhatsAppClient } from "../client";
import type { GraphSuccessResponse, MediaMetadataResponse, MediaUploadResponse } from "../types";

type Uploadable = Blob | File | ArrayBuffer | Uint8Array | Buffer;

const uploadSchema = z.object({
  phoneNumberId: z.string().min(1, "phoneNumberId is required"),
  type: z.string().min(1, "type is required"),
  file: z.custom<Uploadable>(),
  fileName: z.string().min(1).optional(),
  messagingProduct: z.string().min(1).optional(),
  uploadStrategy: z.enum(["default", "resumable"]).optional()
});

const getSchema = z.object({
  mediaId: z.string().min(1, "mediaId is required"),
  phoneNumberId: z.string().min(1).optional()
});

type UploadInput = z.infer<typeof uploadSchema>;
type GetInput = z.infer<typeof getSchema>;

/**
 * Manage media: upload, get metadata, and delete.
 * @category Media
 */
export class MediaResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request" | "isKapsoProxy">) {}

  async upload(input: UploadInput): Promise<MediaUploadResponse> {
    const parsed = uploadSchema.parse(input);
    const form = new FormData();
    form.set("messaging_product", parsed.messagingProduct ?? "whatsapp");
    form.set("type", parsed.type);

    const blob = toBlob(parsed.file);

    if (parsed.fileName) {
      form.set("file", blob, parsed.fileName);
    } else {
      form.set("file", blob);
    }

    if (parsed.uploadStrategy) {
      form.set("upload_strategy", parsed.uploadStrategy);
    }

    return this.client.request<MediaUploadResponse>("POST", `${parsed.phoneNumberId}/media`, {
      body: form,
      responseType: "json"
    });
  }

  async get(input: GetInput): Promise<MediaMetadataResponse> {
    const parsed = getSchema.parse(input);

    if (this.client.isKapsoProxy() && !parsed.phoneNumberId) {
      throw new Error("phoneNumberId is required when using the Kapso proxy");
    }

    return this.client.request<MediaMetadataResponse>("GET", parsed.mediaId, {
      query: buildMediaQuery(parsed.phoneNumberId),
      responseType: "json"
    });
  }

  async delete(input: GetInput): Promise<GraphSuccessResponse> {
    const parsed = getSchema.parse(input);

    if (this.client.isKapsoProxy() && !parsed.phoneNumberId) {
      throw new Error("phoneNumberId is required when using the Kapso proxy");
    }

    return this.client.request<GraphSuccessResponse>("DELETE", parsed.mediaId, {
      query: buildMediaQuery(parsed.phoneNumberId),
      responseType: "json"
    });
  }

  /**
   * Download media bytes for a given mediaId.
   * - Uses {@link get} to resolve the short-lived URL, then performs a raw fetch with client auth headers.
   * - Set `as` to control the return type. Defaults to `arrayBuffer`.
   */
  async download(input: GetInput & { headers?: Record<string, string>; as?: "arrayBuffer" | "blob" | "response"; auth?: "auto" | "never" | "always" }): Promise<ArrayBuffer | Blob | Response> {
    const parsed = getSchema.parse(input);

    if (this.client.isKapsoProxy() && !parsed.phoneNumberId) {
      throw new Error("phoneNumberId is required when using the Kapso proxy");
    }

    const metadata = await this.get({ mediaId: parsed.mediaId, phoneNumberId: parsed.phoneNumberId });
    const url = new URL(metadata.url);
    const host = url.hostname.toLowerCase();
    const isKapsoHost = host.endsWith("kapso.ai");
    const authMode = input.auth ?? "auto";
    const clientWithFetch = this.client as unknown as WhatsAppClient & {
      fetch: (url: string, init?: RequestInit & { headers?: Record<string, string> }) => Promise<Response>;
      rawFetch: (url: string, init?: RequestInit) => Promise<Response>;
    };

    // Decide whether to attach auth headers when fetching the media URL
    let res: Response;
    const wantAuth = authMode === "always" || (authMode === "auto" && isKapsoHost);

    if (wantAuth) {
      res = await clientWithFetch.fetch(metadata.url, { headers: input.headers });
    } else {
      // No auth headers for public CDNs (e.g., lookaside.cdnwhatsapp.net)
      res = await clientWithFetch.rawFetch(metadata.url, { headers: input.headers });
      // Safety net: if Kapso host signals 401/403 and auto mode, retry once with auth
      if ((res.status === 401 || res.status === 403) && authMode === "auto" && isKapsoHost) {
        res = await clientWithFetch.fetch(metadata.url, { headers: input.headers });
      }
    }

    if (input.as === "response") return res;
    if (input.as === "blob") return res.blob();
    return res.arrayBuffer();
  }
}

function buildMediaQuery(phoneNumberId?: string) {
  if (!phoneNumberId) {
    return undefined;
  }

  return { phoneNumberId };
}

function toBlob(uploadable: Uploadable): Blob {
  if (uploadable instanceof Blob) {
    return uploadable;
  }

  if (typeof File !== "undefined" && uploadable instanceof File) {
    return uploadable;
  }

  if (uploadable instanceof ArrayBuffer) {
    return new Blob([uploadable]);
  }

  if (ArrayBuffer.isView(uploadable)) {
    const view = new Uint8Array(uploadable.buffer, uploadable.byteOffset, uploadable.byteLength);
    const copy = view.slice();
    return new Blob([copy.buffer]);
  }

  throw new TypeError("Unsupported uploadable type");
}
