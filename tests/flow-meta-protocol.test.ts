import { constants, createCipheriv, createDecipheriv, createHmac, generateKeyPairSync, publicEncrypt, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { receive, respond } from "../src/server/flows";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const secret = "dummy-app-secret";
function fixture(payload: unknown = { action: "DATA_EXCHANGE", screen: "FORM", flow_token: "TOKEN", data: { some_value: true } }) {
  const key = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-gcm", key, iv);
  const envelope = {
    encrypted_flow_data: Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString("base64"),
    encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64"),
    initial_vector: iv.toString("base64")
  };
  const options = (body = envelope) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { rawBody, phoneNumberId: "123", appSecret: secret,
      headers: { "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}` },
      getPrivateKey: async () => pem, verifyToken: vi.fn(async (token: string) => token === "TOKEN") };
  };
  const decryptResponse = (body: string) => {
    const bytes = Buffer.from(body, "base64");
    const decipher = createDecipheriv("aes-128-gcm", key, Buffer.from(iv.map(byte => byte ^ 0xff)));
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString());
  };
  return { envelope, options, decryptResponse };
}

describe("Meta Flow callback protocol", () => {
  it("decrypts a native request, verifies its token, encrypts the response with inverted IV", async () => {
    const f = fixture();
    const opts = f.options();
    const context = await receive(opts);
    expect(opts.verifyToken).toHaveBeenCalledWith("TOKEN", { phoneNumberId: "123" });
    expect(context).toMatchObject({ action: "DATA_EXCHANGE", screen: "FORM", flowToken: "TOKEN", data: { someValue: true } });
    const reply = respond({ context, screen: "DONE", data: { result: "ok" } });
    expect(reply.headers["Content-Type"]).toBe("text/plain");
    expect(f.decryptResponse(reply.body)).toEqual({ screen: "DONE", data: { result: "ok" } });
    expect(JSON.stringify(context)).not.toContain("encryptedAesKey");
  });
  it("rejects unsigned input before key access or token verification", async () => {
    const opts = { ...fixture().options(), headers: {}, getPrivateKey: vi.fn() };
    await expect(receive(opts)).rejects.toMatchObject({ status: 432 });
    expect(opts.getPrivateKey).not.toHaveBeenCalled();
    expect(opts.verifyToken).not.toHaveBeenCalled();
  });
  it.each(["encrypted_flow_data", "encrypted_aes_key", "initial_vector"] as const)("rejects tampered %s before token verification", async field => {
    const f = fixture();
    const bytes = Buffer.from(f.envelope[field], "base64");
    bytes[0] ^= 255;
    const opts = f.options({ ...f.envelope, [field]: bytes.toString("base64") });
    await expect(receive(opts)).rejects.toMatchObject({ status: 421 });
    expect(opts.verifyToken).not.toHaveBeenCalled();
  });
  it("returns an encrypted 427 for invalid tokens", async () => {
    const f = fixture({ action: "INIT", flow_token: "INVALID" });
    try { await receive(f.options()); throw new Error("Expected rejection"); }
    catch (error) {
      expect(error).toMatchObject({ status: 427 });
      expect(f.decryptResponse((error as { body: string }).body)).toHaveProperty("error_msg");
    }
  });
  it("supports encrypted ping replies without a token", async () => {
    const f = fixture({ action: "ping", version: "3.0" });
    const context = await receive({ ...f.options(), verifyToken: undefined });
    expect(context.action).toBe("PING");
    expect(f.decryptResponse(respond({ context, data: { status: "active" } }).body)).toEqual({ data: { status: "active" } });
  });
  it("requires token verification for business actions", async () => {
    for (const verifyToken of [undefined, true as unknown as (token: string) => boolean]) {
      await expect(receive({ ...fixture().options(), verifyToken })).rejects.toMatchObject({ status: 500 });
    }
  });
  it("requires explicit adapter mode and token verification for plaintext", async () => {
    const base = { phoneNumberId: "123", getPrivateKey: async () => undefined };
    for (const payload of [null, [], "text"]) {
      await expect(receive({ ...base, rawBody: Buffer.from(JSON.stringify(payload)) })).rejects.toMatchObject({ status: 400 });
    }
    const rawBody = Buffer.from(JSON.stringify({ action: "BACK", flow_token: "TOKEN" }));
    await expect(receive({ ...base, rawBody })).rejects.toMatchObject({ status: 500 });
    await expect(receive({ ...base, rawBody, inputFormat: "decrypted" })).rejects.toMatchObject({ status: 500 });
    expect(await receive({ ...base, rawBody, inputFormat: "decrypted", verifyToken: token => token === "TOKEN" })).toMatchObject({ action: "BACK" });
    await expect(receive({ ...base, rawBody: Buffer.from(JSON.stringify({ encrypted_flow_data: "abc", encryption_metadata: {} })), inputFormat: "decrypted", verifyToken: () => true })).rejects.toMatchObject({ status: 400 });
  });
});

it("rejects a correctly signed plaintext or incomplete callback envelope", async () => {
  const f = fixture();
  for (const body of [{ action: "COMPLETE", flow_token: "TOKEN" }, { encrypted_flow_data: "abc", encryption_metadata: {} }]) {
    const rawBody = Buffer.from(JSON.stringify(body));
    const opts = { ...f.options(), rawBody, headers: { "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}` }, getPrivateKey: vi.fn() };
    await expect(receive(opts)).rejects.toMatchObject({ status: 400 });
    expect(opts.getPrivateKey).not.toHaveBeenCalled();
  }
});

it("rejects wrong signatures, missing private keys, missing tokens, and unsupported actions", async () => {
  const f = fixture();
  await expect(receive({ ...f.options(), headers: { "X-Hub-Signature-256": "sha256=" + "0".repeat(64) } })).rejects.toMatchObject({ status: 432 });
  await expect(receive({ ...f.options(), getPrivateKey: async () => undefined })).rejects.toMatchObject({ status: 500 });
  await expect(receive(fixture({ action: "COMPLETE" }).options())).rejects.toMatchObject({ status: 427 });
  await expect(receive(fixture({ action: "UNKNOWN", flow_token: "TOKEN" }).options())).rejects.toMatchObject({ status: 400 });
});

it("supports private JWK keys", async () => {
  const context = await receive({ ...fixture().options(), getPrivateKey: async () => privateKey.export({ format: "jwk" }) });
  expect(context.flowToken).toBe("TOKEN");
});

it("never downgrades an unknown, copied, or consumed native context to plaintext", async () => {
  const context = await receive(fixture().options());
  expect(() => respond({ context: { ...context }, screen: "PRIVATE" })).toThrow("Unknown or already used");
  expect(respond({ context, screen: "PRIVATE" }).headers["Content-Type"]).toBe("text/plain");
  expect(() => respond({ context, screen: "CHANGED" })).toThrow("Unknown or already used");
  // The documented JSON builder is still available when no native context is supplied.
  expect(respond({ screen: "DONE" }).headers["Content-Type"]).toBe("application/json");
});

it("returns JSON only for an explicitly verified decrypted adapter context", async () => {
  const context = await receive({ rawBody: Buffer.from(JSON.stringify({ action: "BACK", flow_token: "TOKEN" })), phoneNumberId: "123", inputFormat: "decrypted", getPrivateKey: async () => undefined, verifyToken: () => true });
  expect(respond({ context, screen: "FORM" }).headers["Content-Type"]).toBe("application/json");
});

it("authenticates original bytes rather than reserialized JSON", async () => {
  const options = fixture().options();
  const getPrivateKey = vi.fn();
  await expect(receive({ ...options, rawBody: Buffer.concat([options.rawBody, Buffer.from("\n")]), getPrivateKey })).rejects.toMatchObject({ status: 432 });
  expect(getPrivateKey).not.toHaveBeenCalled();
});

it("reports invalid key configuration as 500 without exposing key material", async () => {
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  for (const key of ["dummy-invalid-private-key", ec]) {
    await expect(receive({ ...fixture().options(), getPrivateKey: async () => key })).rejects.toMatchObject({ status: 500, body: JSON.stringify({ error: "Unable to load Flow RSA private key" }) });
  }
  await expect(receive({ ...fixture().options(), getPrivateKey: async () => { throw new Error("dummy-secret-provider-error"); } })).rejects.toMatchObject({ status: 500, message: "Unable to load Flow RSA private key" });
});

it("supports encrypted PEM and rejects a wrong passphrase as a configuration error", async () => {
  const encryptedPem = privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "dummy-passphrase" }).toString();
  const options = { ...fixture().options(), getPrivateKey: async () => encryptedPem };
  expect((await receive({ ...options, privateKeyPassphrase: "dummy-passphrase" })).flowToken).toBe("TOKEN");
  await expect(receive({ ...options, privateKeyPassphrase: "wrong" })).rejects.toMatchObject({ status: 500 });
});

it("reports a different valid RSA private key as callback decryption failure", async () => {
  const differentKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  await expect(receive({ ...fixture().options(), getPrivateKey: async () => differentKey })).rejects.toMatchObject({ status: 421 });
});


it("supports Web Crypto private keys", async () => {
  const der = new Uint8Array(privateKey.export({ type: "pkcs8", format: "der" }));
  const key = await webcrypto.subtle.importKey("pkcs8", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const context = await receive({ ...fixture().options(), getPrivateKey: async () => key as unknown as CryptoKey });
  expect(context.flowToken).toBe("TOKEN");
});
