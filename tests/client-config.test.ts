import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src";
import type { WhatsAppClientConfig } from "../src";

describe("WhatsAppClient config", () => {
  const setupFetch = () => {
    const responses: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      responses.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(null, { status: 200 });
    };

    return { fetchMock, responses } as const;
  };

  it("throws when neither access token nor Kapso API key is provided", () => {
    expect(() => new WhatsAppClient({} as WhatsAppClientConfig)).toThrowError(
      "Must provide either an accessToken or kapsoApiKey"
    );
  });

  it("constructs default Graph API URL with v23.0", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "test-token", fetch: fetchMock });

    await client.request("GET", "123/messages");

    expect(responses[0]?.url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(responses[0]?.init.headers).toMatchObject({
      Authorization: "Bearer test-token"
    });
  });

  it("respects custom baseUrl and adds Kapso API key header", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({
      kapsoApiKey: "kapso-key",
      baseUrl: "https://app.kapso.ai/api/meta",
      fetch: fetchMock
    });

    await client.request("POST", "/123/messages", { body: { messagingProduct: "whatsapp" } });

    expect(responses[0]?.url).toBe("https://app.kapso.ai/api/meta/v23.0/123/messages");
    expect(responses[0]?.init.headers).toMatchObject({
      "X-API-Key": "kapso-key"
    });
  });

  it("accepts explicit graph version override", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({
      accessToken: "token",
      graphVersion: "v21.5",
      fetch: fetchMock
    });

    await client.request("GET", "/phone/messages");

    expect(responses[0]?.url).toBe("https://graph.facebook.com/v21.5/phone/messages");
  });

  it("allows supplying both access token and Kapso key (headers merged)", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({
      accessToken: "token",
      kapsoApiKey: "kapso-key",
      fetch: fetchMock
    });

    await client.request("GET", "123/messages");

    expect(responses[0]?.init.headers).toMatchObject({
      Authorization: "Bearer token",
      "X-API-Key": "kapso-key"
    });
  });
});
