import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src";

// deploy() and get() through the Kapso proxy. Flow routes such as /{flowId}/assets
// carry no WABA in the path, so the proxy needs phone_number_id or business_account_id
// as a query parameter or it answers 404 "WhatsApp configuration not found".

const KAPSO_BASE_URL = "https://api.kapso.ai/meta/whatsapp";
const FLOW = { version: "7.2", screens: [] };

function setupFetch() {
  const calls: Array<{ url: URL; method: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url: new URL(url), method: init?.method ?? "GET" });
    return new Response(
      JSON.stringify({ id: "FLOW", success: true, preview: { preview_url: "https://preview", expires_at: "2026-01-01" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  return { fetchMock, calls };
}

function byPath(calls: Array<{ url: URL; method: string }>, suffix: string) {
  const call = calls.find((c) => c.url.pathname.endsWith(suffix));
  if (!call) throw new Error(`no call to ${suffix}; got ${calls.map((c) => c.url.pathname).join(", ")}`);
  return call.url.searchParams;
}

describe("flows.deploy through the Kapso proxy", () => {
  it("scopes asset upload, publish and preview to the WABA when no scope is given", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ baseUrl: KAPSO_BASE_URL, kapsoApiKey: "key", fetch: fetchMock });

    await client.flows.deploy(FLOW, {
      name: "order-confirm",
      wabaId: "WABA",
      flowId: "FLOW",
      forceAssetUpload: true,
      publish: true,
      preview: true
    });

    expect(calls.map((c) => c.url.pathname)).toEqual(["/meta/whatsapp/v23.0/FLOW/assets", "/meta/whatsapp/v23.0/FLOW/publish", "/meta/whatsapp/v23.0/FLOW"]);
    for (const suffix of ["/FLOW/assets", "/FLOW/publish", "/FLOW"]) {
      const query = byPath(calls, suffix);
      expect(query.get("business_account_id")).toBe("WABA");
      expect(query.get("phone_number_id")).toBeNull();
    }
    expect(byPath(calls, "/FLOW").get("fields")).toBe("preview.invalidate(false)");
  });

  it("creates through the WABA path and scopes the follow-up calls", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ baseUrl: KAPSO_BASE_URL, kapsoApiKey: "key", fetch: fetchMock });

    await client.flows.deploy(FLOW, { name: "order-confirm", wabaId: "WABA", publish: true });

    expect(calls[0]?.url.pathname).toBe("/meta/whatsapp/v23.0/WABA/flows");
    expect(calls[0]?.url.searchParams.get("business_account_id")).toBeNull();
    expect(byPath(calls, "/FLOW/publish").get("business_account_id")).toBe("WABA");
  });

  it("prefers an explicit phoneNumberId over the WABA fallback", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ baseUrl: KAPSO_BASE_URL, kapsoApiKey: "key", fetch: fetchMock });

    await client.flows.deploy(FLOW, {
      name: "order-confirm",
      wabaId: "WABA",
      flowId: "FLOW",
      forceAssetUpload: true,
      publish: true,
      preview: { interactive: true, params: { flowAction: "navigate" } },
      phoneNumberId: "PHONE123"
    });

    for (const suffix of ["/FLOW/assets", "/FLOW/publish", "/FLOW"]) {
      const query = byPath(calls, suffix);
      expect(query.get("phone_number_id")).toBe("PHONE123");
      expect(query.get("business_account_id")).toBeNull();
    }
    expect(byPath(calls, "/FLOW").get("flow_action")).toBe("navigate");
  });

  it("passes an explicit businessAccountId as given", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ baseUrl: KAPSO_BASE_URL, kapsoApiKey: "key", fetch: fetchMock });

    await client.flows.deploy(FLOW, {
      name: "order-confirm",
      wabaId: "WABA",
      flowId: "FLOW",
      forceAssetUpload: true,
      businessAccountId: "OTHER_WABA"
    });

    expect(byPath(calls, "/FLOW/assets").get("business_account_id")).toBe("OTHER_WABA");
  });

  it("adds no scope parameters when talking to the Graph API directly", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.deploy(FLOW, {
      name: "order-confirm",
      wabaId: "WABA",
      flowId: "FLOW",
      forceAssetUpload: true,
      publish: true,
      preview: true
    });

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.url.hostname).toBe("graph.facebook.com");
      expect(call.url.searchParams.get("business_account_id")).toBeNull();
      expect(call.url.searchParams.get("phone_number_id")).toBeNull();
    }
  });

  it("still honors an explicit scope on the Graph API, like the lower-level methods do", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.deploy(FLOW, { name: "order-confirm", wabaId: "WABA", flowId: "FLOW", forceAssetUpload: true, phoneNumberId: "PHONE123" });

    expect(byPath(calls, "/FLOW/assets").get("phone_number_id")).toBe("PHONE123");
  });
});

describe("flows.get through the Kapso proxy", () => {
  it("accepts phoneNumberId and businessAccountId next to fields", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ baseUrl: KAPSO_BASE_URL, kapsoApiKey: "key", fetch: fetchMock });

    await client.flows.get({ flowId: "FLOW", fields: "id,status", phoneNumberId: "PHONE123" });
    await client.flows.get({ flowId: "FLOW", businessAccountId: "WABA" });

    expect(calls[0]?.url.pathname).toBe("/meta/whatsapp/v23.0/FLOW");
    expect(calls[0]?.url.searchParams.get("fields")).toBe("id,status");
    expect(calls[0]?.url.searchParams.get("phone_number_id")).toBe("PHONE123");
    expect(calls[1]?.url.searchParams.get("business_account_id")).toBe("WABA");
    expect(calls[1]?.url.searchParams.get("fields")).toBeNull();
  });

  it("sends no query at all when nothing is given", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.get({ flowId: "FLOW" });

    expect(calls[0]?.url.search).toBe("");
  });
});
