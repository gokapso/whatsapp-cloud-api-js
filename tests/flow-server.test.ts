import { describe, expect, it } from "vitest";
import { receive as receiveFlowEvent, respond as respondToFlow, downloadAndDecrypt, FlowServerError } from "../src/server/flows";
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

describe("flowServer.receive", () => {
  it("decrypts payload and camelizes form/data", async () => {
    const photoFixture = buildEncryptedPayload({ foo: "bar" });
    const plainPayload = {
      action: "DATA_EXCHANGE",
      screen: "UPLOAD",
      flow_token: "TOKEN",
      form: {
        "id_photo": [
          {
            media_id: "MEDIA1",
            cdn_url: "https://cdn.example/file",
            file_name: "IMG.jpg",
            encryption_metadata: {
              encryption_key: photoFixture.metadataForMedia.encryptionKey,
              hmac_key: photoFixture.metadataForMedia.hmacKey,
              iv: photoFixture.metadataForMedia.iv,
              encrypted_hash: photoFixture.metadataForMedia.encryptedHash,
              plaintext_hash: photoFixture.metadataForMedia.plaintextHash
            }
          }
        ]
      },
      data: {
        action: "update_date",
        "some-value": true
      }
    };
    const fixture = buildEncryptedPayload(plainPayload as unknown as Record<string, unknown>);
    const rawBody = Buffer.from(JSON.stringify(fixture.body));

    const ctx = await receiveFlowEvent({
      rawBody,
      phoneNumberId: "PHONE",
      getPrivateKey: async () => undefined
    });

    expect(ctx.action).toBe("DATA_EXCHANGE");
    expect(ctx.screen).toBe("UPLOAD");
    expect(ctx.flowToken).toBe("TOKEN");
    expect(ctx.data).toMatchObject({ action: "update_date", someValue: true });
    const idPhoto = (ctx.form.idPhoto as any[])[0];
    expect(idPhoto.mediaId).toBe("MEDIA1");
    expect(idPhoto.cdnUrl).toBe("https://cdn.example/file");
    expect(idPhoto.encryptionMetadata).toBeDefined();
  });

  it("throws 421 when encrypted hash mismatches", async () => {
    const fixture = buildEncryptedPayload({ action: "COMPLETE", screen: "DONE", flow_token: "TOKEN" });
    const body = {
      ...fixture.body,
      encryption_metadata: {
        ...fixture.body.encryption_metadata,
        encrypted_hash: randomBytes(32).toString("base64")
      }
    };
    await expect(
      receiveFlowEvent({
        rawBody: Buffer.from(JSON.stringify(body)),
        phoneNumberId: "PHONE",
        getPrivateKey: async () => undefined
      })
    ).rejects.toMatchObject({ status: 421 });
  });

  it("throws 432 when HMAC tag mismatches", async () => {
    const fixture = buildEncryptedPayload({ action: "COMPLETE", screen: "DONE", flow_token: "TOKEN" });
    const cipher = Buffer.from(fixture.body.encrypted_flow_data, "base64");
    cipher[cipher.length - 1] ^= 0xff;
    const tamperedBody = {
      ...fixture.body,
      encrypted_flow_data: cipher.toString("base64"),
      encryption_metadata: {
        ...fixture.body.encryption_metadata,
        encrypted_hash: createHash("sha256").update(cipher).digest("base64")
      }
    };

    await expect(
      receiveFlowEvent({
        rawBody: Buffer.from(JSON.stringify(tamperedBody)),
        phoneNumberId: "PHONE",
        getPrivateKey: async () => undefined
      })
    ).rejects.toMatchObject({ status: 432 });
  });

  it("throws 427 when verifyToken fails", async () => {
    const fixture = buildEncryptedPayload({ action: "DATA_EXCHANGE", screen: "S", flow_token: "TOKEN" });
    await expect(
      receiveFlowEvent({
        rawBody: Buffer.from(JSON.stringify(fixture.body)),
        phoneNumberId: "PHONE",
        getPrivateKey: async () => undefined,
        verifyToken: async () => false
      })
    ).rejects.toMatchObject({ status: 427 });
  });
});

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
