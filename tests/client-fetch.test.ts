import { describe, it, expect } from "vitest";
import { WhatsAppClient } from "../src";

describe("WhatsAppClient.fetch", () => {
  it("uses absolute URL unchanged and merges Authorization header", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    };

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const res = await client.fetch("https://files.example/resource", { method: "GET", headers: { Accept: "image/*" } });
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://files.example/resource");
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token");
    expect(headers["Accept"]).toBe("image/*");
  });

  it("sends X-API-Key when configured with Kapso key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    };

    const client = new WhatsAppClient({ kapsoApiKey: "kapso", fetch: fetchMock });
    await client.fetch("https://cdn.kapso.ai/media/123");
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("kapso");
  });
});

