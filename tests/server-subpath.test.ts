import { describe, it, expect } from "vitest";

// Import from the server-only subpath in source. The built package will expose
// this as "@kapso/whatsapp-cloud-api/server".
import { normalizeWebhook, verifySignature } from "../src/server";

describe("Server subpath", () => {
  it("exports verifySignature function", () => {
    expect(typeof verifySignature).toBe("function");
  });

  it("exports normalizeWebhook helper", () => {
    expect(typeof normalizeWebhook).toBe("function");
  });

  it("validates a known signature", () => {
    const appSecret = "shhh";
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    // Compute the signature using Node's crypto for the test oracle
    const crypto = require("node:crypto");
    const expected = crypto.createHmac("sha256", appSecret).update(body).digest("hex");
    const header = `sha256=${expected}`;
    expect(
      verifySignature({ appSecret, rawBody: body, signatureHeader: header })
    ).toBe(true);
  });
});
