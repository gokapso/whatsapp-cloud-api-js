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
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

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
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    await client.calls.connect({ phoneNumberId: "123", to: "14085551234" });

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).not.toHaveProperty("session");
  });

  it("connect accepts a BSUID recipient without a phone number", async () => {
    const { fetchMock, calls } = setupFetch({
      messaging_product: "whatsapp",
      calls: [{ id: "wacid.TEST" }]
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    await client.calls.connect({
      phoneNumberId: "123",
      recipient: "US.13491208655302741918"
    });

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({ recipient: "US.13491208655302741918", action: "connect" });
    expect(body).not.toHaveProperty("to");
  });

  it("connect rejects a call with neither to nor recipient", async () => {
    const { fetchMock } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    // No longer compiles without a cast: RecipientAddress requires one of the two.
    await expect(client.calls.connect({ phoneNumberId: "123" } as never)).rejects.toThrow(
      /to \(a phone number\), recipient \(a business-scoped user ID\)/
    );
  });

  it("preAccept posts pre_accept action", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

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
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

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
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    await client.calls.reject({ phoneNumberId: "123", callId: "wacid.123" });

    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      action: "reject",
      call_id: "wacid.123"
    });
  });

  it("terminate posts terminate action", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

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
    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });

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
          id: "a29edbfe-f181-4a10-b3b0-0d2bb66e390b",
          call_id: "wacid.123",
          phone_number_id: "123",
          whatsapp_config_id: "config-1",
          business_scoped_user_id: "US.1",
          parent_business_scoped_user_id: "US.2",
          username: "caller",
          direction: "OUTBOUND",
          status: "FAILED"
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    const call = await client.calls.get({ phoneNumberId: "123", callId: "wacid.123" });

    expect(calls[0]?.url).toContain("/v23.0/123/calls?");
    expect(calls[0]?.url).toContain("call_id=wacid.123");
    expect(call).toMatchObject({
      id: "a29edbfe-f181-4a10-b3b0-0d2bb66e390b", callId: "wacid.123", status: "FAILED",
      phoneNumberId: "123", whatsappConfigId: "config-1", businessScopedUserId: "US.1",
      parentBusinessScopedUserId: "US.2", username: "caller"
    });
    expectTypeOf(call?.callId).toEqualTypeOf<string | undefined>();
  });

  it.each(["list", "get"] as const)("%s preserves explicit null identity fields for phone-only calls", async (action) => {
    const { fetchMock } = setupFetch({
      data: [{
        id: "a29edbfe-f181-4a10-b3b0-0d2bb66e390b", call_id: "wacid.PHONE",
        user_wa_id: "15551234567", business_scoped_user_id: null,
        parent_business_scoped_user_id: null, username: null
      }],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });
    const call = action === "list"
      ? (await client.calls.list({ phoneNumberId: "123" })).data[0]
      : await client.calls.get({ phoneNumberId: "123", callId: "wacid.PHONE" });

    expect(call).toMatchObject({ businessScopedUserId: null, parentBusinessScopedUserId: null, username: null });
    expectTypeOf(call?.businessScopedUserId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(call?.parentBusinessScopedUserId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(call?.username).toEqualTypeOf<string | null | undefined>();
  });

  it("get returns undefined when call not found", async () => {
    const { fetchMock } = setupFetch({
      data: [],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ kapsoApiKey: "key", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    const call = await client.calls.get({ phoneNumberId: "123", callId: "missing" });

    expect(call).toBeUndefined();
  });

  it.each(["connect", "accept"] as const)("%s forwards optional native capture in snake case", async (action) => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ kapsoApiKey: "key", fetch: fetchMock });
    const capture = { status: "ENABLED" as const, purpose: "quality assurance", announcementLanguage: "en_US" };
    await client.calls[action]({ phoneNumberId: "123", to: "15551234567", callId: "wacid.123",
      session: { sdpType: "answer", sdp: "v=0" }, recording: capture, transcription: capture });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      recording: { status: "ENABLED", purpose: "quality assurance", announcement_language: "en_US" },
      transcription: { status: "ENABLED", purpose: "quality assurance", announcement_language: "en_US" }
    });
  });

  it.each(["connect", "accept"] as const)("%s leaves capture opt-in and allows DISABLED without announcement", async (action) => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const input = { phoneNumberId: "123", to: "15551234567", callId: "wacid.123", session: { sdpType: "answer", sdp: "v=0" } };
    await client.calls[action](input);
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty("recording");
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty("transcription");
    await client.calls[action]({ ...input, recording: { status: "DISABLED" }, transcription: { status: "DISABLED" } });
    expect(JSON.parse(String(calls[1]?.init.body))).toMatchObject({ recording: { status: "DISABLED" }, transcription: { status: "DISABLED" } });
  });

  it.each(["connect", "accept"] as const)("%s rejects invalid capture before fetch", async (action) => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    for (const key of ["recording", "transcription"]) {
      for (const capture of [
        { status: "ENABLED" },
        { status: "ENABLED", purpose: "quality" },
        { status: "ENABLED", announcementLanguage: "en_US" },
        { status: "ENABLED", purpose: "", announcementLanguage: "en_US" },
        { status: "ENABLED", purpose: "quality", announcementLanguage: "" },
        { status: "ENABLED", purpose: "x".repeat(251), announcementLanguage: "en_US" },
        { status: "UNKNOWN" }
      ]) {
        await expect(client.calls[action]({ phoneNumberId: "123", to: "15551234567", callId: "wacid.123",
          session: { sdpType: "answer", sdp: "v=0" }, [key]: capture } as never)).rejects.toThrow();
      }
    }
    expect(calls).toHaveLength(0);
  });

  it.each(["recording", "transcription"])("preAccept rejects even an undefined %s key before fetch", async (key) => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    for (const value of [undefined, { status: "DISABLED" }]) {
      await expect(client.calls.preAccept({ phoneNumberId: "123", callId: "wacid.123",
        session: { sdpType: "answer", sdp: "v=0" }, [key]: value } as never)).rejects.toThrow(/capture options apply to connect\/accept only/i);
    }
    expect(calls).toHaveLength(0);
  });

  it("permissions.get supports BSUID and rejects both or neither address", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await client.calls.permissions.get({ phoneNumberId: "123", recipient: "US.13491208655302741918" });
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/call_permissions?recipient=US.13491208655302741918");
    for (const address of [{}, { userWaId: "15551234567", recipient: "US.1" }]) {
      await expect(client.calls.permissions.get({ phoneNumberId: "123", ...address } as never)).rejects.toThrow();
    }
    expect(calls).toHaveLength(1);
  });

});
