import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src";

describe("Flows resource with proxy params", () => {
  const setupFetch = () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    return { fetchMock, calls };
  };

  it("appends phone_number_id for publish", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.publish({ flowId: "FLOW", phoneNumberId: "PHONE123" });

    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/v23.0/FLOW/publish");
    expect(url.searchParams.get("phone_number_id")).toBe("PHONE123");
  });

  it("falls back to business_account_id when provided", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.deprecate({ flowId: "FLOW", businessAccountId: "BA123" });

    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("business_account_id")).toBe("BA123");
  });

  it("adds phone_number_id for preview", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.preview({
      flowId: "FLOW",
      phoneNumberId: "PHONE123",
      fields: "preview.invalidate(false)"
    });

    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/v23.0/FLOW");
    expect(url.searchParams.get("phone_number_id")).toBe("PHONE123");
    expect(url.searchParams.get("fields")).toBe("preview.invalidate(false)");
  });

  it("adds phone_number_id for asset uploads", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.updateAsset({ flowId: "FLOW", json: { version: "7.2" }, phoneNumberId: "PHONE123" });

    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/v23.0/FLOW/assets");
    expect(url.searchParams.get("phone_number_id")).toBe("PHONE123");
  });
});
