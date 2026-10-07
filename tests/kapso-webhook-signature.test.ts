import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyKapsoWebhookSignature, verifySignature } from "../src/server";

describe("verifyKapsoWebhookSignature", () => {
  const secret = "webhook-secret";
  const rawBody = Buffer.from('{ "text": "Olá 🌎", "a": 1 }\r\n', "utf8");
  const signatureHeader = createHmac("sha256", secret).update(rawBody).digest("hex");

  it("accepts bare hex over exact raw Buffer, Uint8Array, and string bytes", () => {
    for (const body of [rawBody, new Uint8Array(rawBody), rawBody.toString("utf8")]) {
      expect(verifyKapsoWebhookSignature({ secret, rawBody: body, signatureHeader })).toBe(true);
      expect(verifyKapsoWebhookSignature({ secret, rawBody: body, signatureHeader: signatureHeader.toUpperCase() })).toBe(true);
    }
    const binary = new Uint8Array([0, 255, 128, 195, 169, 13, 10]);
    expect(verifyKapsoWebhookSignature({ secret, rawBody: binary,
      signatureHeader: createHmac("sha256", secret).update(binary).digest("hex") })).toBe(true);
  });

  it("rejects tampering, reserialized JSON, and a different secret", () => {
    expect(verifyKapsoWebhookSignature({ secret, rawBody: Buffer.concat([rawBody, Buffer.from(" ")]), signatureHeader })).toBe(false);
    expect(verifyKapsoWebhookSignature({ secret, rawBody: JSON.stringify(JSON.parse(rawBody.toString())), signatureHeader })).toBe(false);
    expect(verifyKapsoWebhookSignature({ secret: "wrong", rawBody, signatureHeader })).toBe(false);
  });

  it.each([undefined, "", "sha256=", `sha256=${signatureHeader}`, "g".repeat(64), signatureHeader.slice(1), signatureHeader + "0", " " + signatureHeader, signatureHeader + "\n"])("rejects malformed or prefixed headers %s", (header) => {
    expect(verifyKapsoWebhookSignature({ secret, rawBody, signatureHeader: header })).toBe(false);
  });

  it("returns false for malformed runtime arguments without throwing", () => {
    for (const input of [undefined, null, {}, { secret: "", rawBody, signatureHeader },
      { secret: 123, rawBody, signatureHeader }, { secret, rawBody: {}, signatureHeader },
      { secret, rawBody: null, signatureHeader }, { secret, rawBody, signatureHeader: 123 }]) {
      expect(verifyKapsoWebhookSignature(input as never)).toBe(false);
    }
  });

  it("keeps Meta's sha256= verifier contract separate", () => {
    expect(verifySignature({ appSecret: secret, rawBody, signatureHeader })).toBe(false);
    expect(verifySignature({ appSecret: secret, rawBody, signatureHeader: `sha256=${signatureHeader}` })).toBe(true);
    expect(verifyKapsoWebhookSignature({ secret, rawBody, signatureHeader: `sha256=${signatureHeader}` })).toBe(false);
  });
});
