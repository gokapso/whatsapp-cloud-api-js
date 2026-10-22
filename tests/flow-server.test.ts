import { describe, expect, it } from "vitest";
import { respond as respondToFlow, downloadAndDecrypt } from "../src/server/flows";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function buildEncryptedPayload(payload: Record<string, unknown>) {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encryptionKey = randomBytes(32);
  const hmacKey = randomBytes(32);
  const iv = randomBytes(16);

  const cipher = createCipheriv("aes-256-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const hmac = createHmac("sha256", hmacKey).update(ciphertext).digest();
  const cipherWithTag = Buffer.concat([ciphertext, hmac.subarray(0, 10)]);

  const encryptedHash = createHash("sha256").update(cipherWithTag).digest("base64");
  const plaintextHash = createHash("sha256").update(plaintext).digest("base64");

  const metadata = {
    encryption_key: encryptionKey.toString("base64"),
    hmac_key: hmacKey.toString("base64"),
    iv: iv.toString("base64"),
    encrypted_hash: encryptedHash,
    plaintext_hash: plaintextHash
  };

  return {
    body: {
      encrypted_flow_data: cipherWithTag.toString("base64"),
      encryption_metadata: metadata,
      flow_token: String(payload.flow_token ?? "TOKEN")
    },
    metadataForMedia: {
      encryptionKey: encryptionKey.toString("base64"),
      hmacKey: hmacKey.toString("base64"),
      iv: iv.toString("base64"),
      encryptedHash,
      plaintextHash
    },
    cipherWithTag,
    plaintext
  };
}

describe("flowServer.respond", () => {
  it("returns JSON payload with defaults", () => {
    const response = respondToFlow({ screen: "DONE" });
    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(response.body).toBe(JSON.stringify({ screen: "DONE", data: {} }));
  });
});

describe("downloadAndDecrypt", () => {
  it("downloads and decrypts media using provided fetch", async () => {
    const fixture = buildEncryptedPayload({ media: true });
    const fetchMock = async () => new Response(fixture.cipherWithTag);

    const result = await downloadAndDecrypt({
      cdnUrl: "https://cdn.example/file",
      encryptionMetadata: fixture.metadataForMedia,
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(Buffer.from(result).toString("utf8")).toBe(JSON.stringify({ media: true }));
  });

  it("throws when hashes mismatch", async () => {
    const fixture = buildEncryptedPayload({ media: true });
    const corrupted = Buffer.from(fixture.cipherWithTag);
    corrupted[0] ^= 0xff;

    await expect(
      downloadAndDecrypt({
        cdnUrl: "https://cdn.example/file",
        encryptionMetadata: fixture.metadataForMedia,
        fetchImpl: async () => new Response(corrupted)
      })
    ).rejects.toThrow();
  });
});
