import { createDecipheriv, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { fromFlowJsonWireCase } from "../utils/flow-json";
import { isPlainObject } from "../utils/case";

export interface FlowReceiveOptions {
  rawBody: Uint8Array | Buffer;
  headers?: Record<string, unknown>;
  phoneNumberId: string;
  getPrivateKey: () => Promise<string | CryptoKey | JsonWebKey | undefined>;
  verifyToken?: (flowToken: string, context: { phoneNumberId: string }) => boolean | Promise<boolean>;
}

export interface FlowContext {
  action: "DATA_EXCHANGE" | "COMPLETE" | "BACK";
  screen: string;
  flowToken: string;
  form: Record<string, unknown>;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface FlowRespondOptions {
  screen: string;
  data?: Record<string, unknown>;
  status?: number;
  headers?: Record<string, string>;
}

export interface DownloadMediaOptions {
  cdnUrl: string;
  encryptionMetadata: {
    encryptedHash: string;
    encryptionKey: string;
    hmacKey: string;
    iv: string;
    plaintextHash: string;
  };
  fetchImpl?: typeof fetch;
}

export class FlowServerError extends Error {
  public readonly status: number;
  public readonly headers: Record<string, string>;
  public readonly body: string;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.headers = { "Content-Type": "application/json" };
    this.body = JSON.stringify({ error: message });
  }
}

export async function receive(options: FlowReceiveOptions): Promise<FlowContext> {
  const rawBuffer = Buffer.from(options.rawBody);
  const text = rawBuffer.toString("utf8");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new FlowServerError(400, "Invalid JSON payload");
  }

  let decrypted: Record<string, unknown> = body;
  if (body.encrypted_flow_data && body.encryption_metadata) {
    const metadata = fromFlowJsonWireCase(body.encryption_metadata) as Record<string, unknown>;
    decrypted = decryptFlowPayload(String(body.encrypted_flow_data), metadata);
  }

  const camel = fromFlowJsonWireCase(decrypted);
  const actionRaw = String(camel.action ?? "").toUpperCase();
  const action = actionRaw === "COMPLETE" ? "COMPLETE" : actionRaw === "BACK" ? "BACK" : "DATA_EXCHANGE";
  const screen = typeof camel.screen === "string" ? camel.screen : "";
  const flowToken = String(camel.flowToken ?? camel.flow_token ?? "");

  if (options.verifyToken) {
    const valid = await options.verifyToken(flowToken, { phoneNumberId: options.phoneNumberId });
    if (!valid) {
      throw new FlowServerError(427, "Invalid flow token");
    }
  }

  const form = isPlainObject(camel.form) ? fromFlowJsonWireCase(camel.form) : {};
  const data = isPlainObject(camel.data) ? fromFlowJsonWireCase(camel.data) : {};

  return {
    action,
    screen,
    flowToken,
    form: form as Record<string, unknown>,
    data: data as Record<string, unknown>,
    raw: camel
  };
}

export function respond(options: FlowRespondOptions): { status: number; headers: Record<string, string>; body: string } {
  const status = options.status ?? 200;
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  const body = JSON.stringify({ screen: options.screen, data: options.data ?? {} });
  return { status, headers, body };
}

export async function downloadAndDecrypt(options: DownloadMediaOptions): Promise<ArrayBuffer> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Global fetch API is not available. Provide fetchImpl explicitly.");
  }

  const response = await fetchImpl(options.cdnUrl);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  const cipherWithTag = Buffer.from(await response.arrayBuffer());
  const plaintext = decryptBuffer(cipherWithTag, normalizeMetadata(options.encryptionMetadata));
  return plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength);
}

function decryptFlowPayload(encrypted: string, metadata: Record<string, unknown>): Record<string, unknown> {
  const cipherWithTag = Buffer.from(encrypted, "base64");
  const meta = normalizeMetadata(metadata);
  const plaintext = decryptBuffer(cipherWithTag, meta);
  try {
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new FlowServerError(400, "Unable to parse decrypted payload");
  }
}

interface NormalizedMetadata {
  encryptionKey: Buffer;
  hmacKey: Buffer;
  iv: Buffer;
  encryptedHash: Buffer;
  plaintextHash: Buffer;
}

function normalizeMetadata(metadata: Record<string, unknown>): NormalizedMetadata {
  const encryptionKey = base64ToBuffer(String(metadata.encryptionKey ?? metadata.encryption_key ?? ""));
  const hmacKey = base64ToBuffer(String(metadata.hmacKey ?? metadata.hmac_key ?? ""));
  const iv = base64ToBuffer(String(metadata.iv ?? ""));
  const encryptedHash = base64ToBuffer(String(metadata.encryptedHash ?? metadata.encrypted_hash ?? ""));
  const plaintextHash = base64ToBuffer(String(metadata.plaintextHash ?? metadata.plaintext_hash ?? ""));

  if (encryptionKey.length === 0 || hmacKey.length === 0 || iv.length === 0) {
    throw new FlowServerError(400, "Missing encryption metadata");
  }

  return { encryptionKey, hmacKey, iv, encryptedHash, plaintextHash };
}

function decryptBuffer(cipherWithTag: Buffer, metadata: NormalizedMetadata): Buffer {
  const encryptedHash = createHash("sha256").update(cipherWithTag).digest();
  if (!timingSafeEqual(encryptedHash, metadata.encryptedHash)) {
    throw new FlowServerError(421, "Encrypted payload hash mismatch");
  }

  if (cipherWithTag.length <= 10) {
    throw new FlowServerError(421, "Invalid ciphertext length");
  }

  const cipher = cipherWithTag.subarray(0, cipherWithTag.length - 10);
  const tag = cipherWithTag.subarray(cipherWithTag.length - 10);
  const computedHmac = createHmac("sha256", metadata.hmacKey).update(cipher).digest();
  if (!timingSafeEqual(tag, computedHmac.subarray(0, 10))) {
    throw new FlowServerError(432, "HMAC validation failed");
  }

  const decipher = createDecipheriv("aes-256-cbc", metadata.encryptionKey, metadata.iv);
  const unpadded = Buffer.concat([decipher.update(cipher), decipher.final()]);
  const plainHash = createHash("sha256").update(unpadded).digest();
  if (!timingSafeEqual(plainHash, metadata.plaintextHash)) {
    throw new FlowServerError(421, "Plaintext hash mismatch");
  }

  return unpadded;
}

function base64ToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64");
}
