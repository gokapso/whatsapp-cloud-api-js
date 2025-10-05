import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../src/webhooks/verify";

describe("Webhook signature verification", () => {
  it("verifies a valid X-Hub-Signature-256 header", () => {
    const appSecret = "shhhh";
    const rawBody = Buffer.from(JSON.stringify({ foo: "bar" }));
    const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const header = `sha256=${digest}`;

    expect(verifySignature({ appSecret, rawBody, signatureHeader: header })).toBe(true);
  });

  it("rejects when header is missing or malformed", () => {
    const appSecret = "shhhh";
    const rawBody = Buffer.from("{}");

    expect(verifySignature({ appSecret, rawBody, signatureHeader: undefined as unknown as string })).toBe(false);
    expect(verifySignature({ appSecret, rawBody, signatureHeader: "sha1=abc" })).toBe(false);
    expect(verifySignature({ appSecret, rawBody, signatureHeader: "sha256=deadbeef" })).toBe(false);
  });
});

