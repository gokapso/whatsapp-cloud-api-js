import { describe, expect, it, expectTypeOf } from "vitest";
import { WhatsAppClient } from "../src";

describe("Calls API", () => {
  const setupFetch = (payload: unknown = { success: true }) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };
    return { fetchMock, calls } as const;
  };

  it("connect sends action connect with session offer", async () => {
    const { fetchMock, calls } = setupFetch({
      messaging_product: "whatsapp",
      calls: [{ id: "wacid.123" }]
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    const response = await client.calls.connect({
      phoneNumberId: "123",
      to: "14085551234",
      session: { sdpType: "offer", sdp: "v=0\r\n..." },
      bizOpaqueCallbackData: "opaque"
    });

    expect(calls[0]?.url).toContain("/v23.0/123/calls");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "14085551234",
      action: "connect",
      session: { sdp_type: "offer", sdp: "v=0\r\n..." },
      biz_opaque_callback_data: "opaque"
    });
    expect(response.calls?.[0]?.id).toBe("wacid.123");
  });

  it("connect omits session when not provided", async () => {
    const { fetchMock, calls } = setupFetch({
      messaging_product: "whatsapp",
      success: true
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    await client.calls.connect({ phoneNumberId: "123", to: "14085551234" });

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).not.toHaveProperty("session");
  });

  it("preAccept posts pre_accept action", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    const result = await client.calls.preAccept({
      phoneNumberId: "123",
      callId: "wacid.123",
      session: { sdpType: "answer", sdp: "v=0" }
    });

    expect(calls[0]?.url).toContain("/v23.0/123/calls");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      action: "pre_accept",
      call_id: "wacid.123",
      session: { sdp_type: "answer", sdp: "v=0" }
    });
    expect(result).toEqual({ success: true });
  });

  it("accept posts accept action and returns success", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    const result = await client.calls.accept({
      phoneNumberId: "123",
      callId: "wacid.123",
      session: { sdpType: "answer", sdp: "v=0" },
      bizOpaqueCallbackData: "tracking"
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      action: "accept",
      call_id: "wacid.123",
      biz_opaque_callback_data: "tracking"
    });
    expect(result).toEqual({ success: true });
  });

  it("reject posts reject action", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    await client.calls.reject({ phoneNumberId: "123", callId: "wacid.123" });

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      action: "reject",
      call_id: "wacid.123"
    });
  });

  it("terminate posts terminate action", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    await client.calls.terminate({ phoneNumberId: "123", callId: "wacid.123" });

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ action: "terminate" });
  });

  it("permissions.get issues GET with wa id", async () => {
    const { fetchMock, calls } = setupFetch({
      messaging_product: "whatsapp",
      permission: { status: "temporary", expiration_time: 12345 }
    });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.calls.permissions.get({ phoneNumberId: "123", userWaId: "15551234567" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/call_permissions?user_wa_id=15551234567");
    expect(result.permission?.status).toBe("temporary");
    expectTypeOf(result).not.toBeAny();
  });

  it("lists calls with filters", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "wacid.123",
          direction: "INBOUND",
          status: "COMPLETED"
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });

    expect(client.isKapsoProxy()).toBe(true);

    const page = await client.calls.list({ phoneNumberId: "123", direction: "INBOUND", limit: 20 });

    expect(calls[0]?.url).toContain("/v23.0/123/calls");
    expect(calls[0]?.url).toContain("direction=INBOUND");
    expect(page.data[0]).toMatchObject({ id: "wacid.123", direction: "INBOUND" });
    expect(page.paging.cursors.after).toBeNull();
  });

  it("retrieves a single call", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "wacid.123",
          direction: "OUTBOUND",
          status: "FAILED"
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    const call = await client.calls.get({ phoneNumberId: "123", callId: "wacid.123" });

    expect(calls[0]?.url).toContain("/v23.0/123/calls?");
    expect(calls[0]?.url).toContain("call_id=wacid.123");
    expect(call).toMatchObject({ id: "wacid.123", status: "FAILED" });
  });

  it("get returns undefined when call not found", async () => {
    const { fetchMock } = setupFetch({
      data: [],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });

    const call = await client.calls.get({ phoneNumberId: "123", callId: "missing" });

    expect(call).toBeUndefined();
  });
});
