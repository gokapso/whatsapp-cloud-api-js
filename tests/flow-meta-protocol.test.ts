import { constants, createCipheriv, createDecipheriv, createHmac, generateKeyPairSync, publicEncrypt, randomBytes } from "node:crypto";
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
    await expect(receive({ ...fixture().options(), verifyToken: undefined })).rejects.toMatchObject({ status: 500 });
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
