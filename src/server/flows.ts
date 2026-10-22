import { constants, createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, KeyObject, privateDecrypt, timingSafeEqual } from "node:crypto";
import type { JsonWebKey as NodeJsonWebKey, webcrypto } from "node:crypto";
import { verifySignature } from "../webhooks/verify";
import { fromFlowJsonWireCase } from "../utils/flow-json";
import { isPlainObject } from "../utils/case";

export interface FlowReceiveOptions {
  rawBody: Uint8Array | Buffer;
  headers?: Record<string, unknown>;
  phoneNumberId: string;
  /** Defaults to Meta's RSA-OAEP/AES-GCM envelope. Decrypted input is for trusted adapters only. */
  inputFormat?: "meta" | "decrypted";
  /** Required for native Meta callbacks; verifies X-Hub-Signature-256 over rawBody. */
  appSecret?: string;
  privateKeyPassphrase?: string;
  getPrivateKey: () => Promise<string | CryptoKey | JsonWebKey | undefined>;
  verifyToken?: (flowToken: string, context: { phoneNumberId: string }) => boolean | Promise<boolean>;
}

export interface FlowContext {
  action: "INIT" | "DATA_EXCHANGE" | "COMPLETE" | "BACK" | "PING";
  screen: string;
  flowToken: string;
  form: Record<string, unknown>;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface FlowRespondOptions {
  /** Pass the context from receive() to encrypt a native Meta response. */
  context?: FlowContext;
  screen?: string;
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

// Keep callback keys out of enumerable/loggable context fields.
const responseKeys = new WeakMap<FlowContext, { key: Buffer; iv: Buffer }>();

export async function receive(options: FlowReceiveOptions): Promise<FlowContext> {
  const rawBuffer = Buffer.from(options.rawBody);
  let body: unknown;
  try {
    body = JSON.parse(rawBuffer.toString("utf8"));
  } catch {
    throw new FlowServerError(400, "Invalid JSON payload");
  }
  if (!isPlainObject(body)) throw new FlowServerError(400, "Expected a JSON object");

  let decrypted: Record<string, unknown>;
  let encryption: { key: Buffer; iv: Buffer } | undefined;
  if (options.inputFormat === "decrypted") {
    if (Object.keys(body).some(key => key.startsWith("encrypted_") || key === "encryption_metadata")) {
      throw new FlowServerError(400, "Expected decrypted input from a trusted adapter");
    }
    decrypted = body;
  } else {
    if (!options.appSecret) throw new FlowServerError(500, "appSecret is required for Meta callbacks");
    const signature = Object.entries(options.headers ?? {}).find(([key]) => key.toLowerCase() === "x-hub-signature-256")?.[1];
    if (typeof signature !== "string" || !/^sha256=[a-fA-F0-9]{64}$/.test(signature) ||
        !verifySignature({ appSecret: options.appSecret, rawBody: rawBuffer, signatureHeader: signature })) {
      throw new FlowServerError(432, "Invalid request signature");
    }
    const fields = ["encrypted_aes_key", "encrypted_flow_data", "initial_vector"] as const;
    if (!fields.every(key => typeof body[key] === "string" && body[key])) {
      throw new FlowServerError(400, "Expected Meta encrypted callback envelope");
    }
    const privateKey = await options.getPrivateKey();
    if (!privateKey) throw new FlowServerError(500, "Flow private key is required");
    try {
      const keyObject = typeof privateKey === "string"
        ? createPrivateKey({ key: privateKey, passphrase: options.privateKeyPassphrase })
        : "kty" in privateKey
          ? createPrivateKey({ key: privateKey as NodeJsonWebKey, format: "jwk" })
          : KeyObject.from(privateKey as webcrypto.CryptoKey);
      const key = privateDecrypt({ key: keyObject, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(String(body.encrypted_aes_key), "base64"));
      const iv = Buffer.from(String(body.initial_vector), "base64");
      const encrypted = Buffer.from(String(body.encrypted_flow_data), "base64");
      if (key.length !== 16 || iv.length !== 16 || encrypted.length <= 16) throw new Error("Invalid encryption parameters");
      const decipher = createDecipheriv("aes-128-gcm", key, iv);
      decipher.setAuthTag(encrypted.subarray(-16));
      const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString("utf8"));
      if (!isPlainObject(parsed)) throw new Error("Expected decrypted object");
      decrypted = parsed;
      encryption = { key, iv };
    } catch {
      throw new FlowServerError(421, "Unable to decrypt Meta callback");
    }
  }

  const camel = fromFlowJsonWireCase(decrypted);
  const action = typeof camel.action === "string" ? camel.action.toUpperCase() : "";
  if (!["INIT", "DATA_EXCHANGE", "COMPLETE", "BACK", "PING"].includes(action)) {
    throw new FlowServerError(400, "Unsupported Flow action");
  }
  const flowToken = typeof camel.flowToken === "string" ? camel.flowToken : "";
  const ctx: FlowContext = {
    action: action as FlowContext["action"],
    screen: typeof camel.screen === "string" ? camel.screen : "",
    flowToken,
    form: isPlainObject(camel.form) ? fromFlowJsonWireCase(camel.form) : {},
    data: isPlainObject(camel.data) ? fromFlowJsonWireCase(camel.data) : {},
    raw: camel
  };
  if (encryption) responseKeys.set(ctx, encryption);
  // Token verification is application authorization, distinct from Meta's signature.
  if (action !== "PING" || options.inputFormat === "decrypted") {
    if (!options.verifyToken) throw new FlowServerError(500, "verifyToken is required for Flow actions");
    if (!flowToken || !await options.verifyToken(flowToken, { phoneNumberId: options.phoneNumberId })) {
      const error = new FlowServerError(427, "Invalid flow token");
      if (encryption) {
        const reply = encryptReply(ctx, { error_msg: "The message is no longer available" });
        Object.assign(error, { body: reply, headers: { "Content-Type": "text/plain" } });
      }
      throw error;
    }
  }
  return ctx;
}

export function respond(options: FlowRespondOptions): { status: number; headers: Record<string, string>; body: string } {
  const payload = { ...(options.screen !== undefined ? { screen: options.screen } : {}), data: options.data ?? {} };
  const encrypted = options.context && responseKeys.has(options.context);
  const headers = { ...(options.headers ?? {}), "Content-Type": encrypted ? "text/plain" : "application/json" };
  return { status: options.status ?? 200, headers, body: encrypted ? encryptReply(options.context!, payload) : JSON.stringify(payload) };
}

function encryptReply(context: FlowContext, payload: Record<string, unknown>): string {
  const encryption = responseKeys.get(context);
  if (!encryption) throw new Error("Missing callback encryption context");
  const cipher = createCipheriv("aes-128-gcm", encryption.key, Buffer.from(encryption.iv.map(byte => byte ^ 0xff)));
  return Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
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
  // Return a fresh ArrayBuffer (not SharedArrayBuffer) to satisfy DOM BlobPart typing in TS
  const copy = new Uint8Array(plaintext.length);
  copy.set(plaintext);
  return copy.buffer;
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
  if (metadata.encryptedHash.length !== encryptedHash.length || !timingSafeEqual(encryptedHash, metadata.encryptedHash)) {
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
  if (metadata.plaintextHash.length !== plainHash.length || !timingSafeEqual(plainHash, metadata.plaintextHash)) {
    throw new FlowServerError(421, "Plaintext hash mismatch");
  }

  return unpadded;
}

function base64ToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64");
}
