import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify X-Hub-Signature-256 for WhatsApp Webhooks using your app secret.
 * Returns true when the signature matches the request body.
 * @category Webhooks
 */
export function verifySignature({ appSecret, rawBody, signatureHeader }: { appSecret: string; rawBody: Buffer | string; signatureHeader?: string }): boolean {
  try {
    if (!signatureHeader || typeof signatureHeader !== "string") return false;
    const [algo, received] = signatureHeader.split("=");
    if (algo !== "sha256" || !received) return false;
    const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
    const expected = createHmac("sha256", appSecret).update(body).digest("hex");
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
