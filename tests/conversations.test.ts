import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src";

describe("Conversations API", () => {
  const setupFetch = (payload: unknown) => {
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

  it("lists conversations with filters and camel-cased response", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "conv-1",
          phone_number: "+15551234567",
          status: "active",
          last_active_at: "2025-01-01T12:00:00Z",
          phone_number_id: "123"
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });

    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });

    const result = await client.conversations.list({
      phoneNumberId: "123",
      status: "active",
      lastActiveSince: "2025-01-01T00:00:00Z",
      limit: 20
    });

    expect(calls[0]?.url).toContain("/v23.0/123/conversations?");
    expect(calls[0]?.url).toContain("status=active");
    expect(calls[0]?.url).toContain("last_active_since=2025-01-01T00%3A00%3A00Z");
    expect(result.data[0]).toMatchObject({
      id: "conv-1",
      phoneNumber: "+15551234567",
      status: "active",
      lastActiveAt: "2025-01-01T12:00:00Z",
      phoneNumberId: "123"
    });
    expect(result.paging.cursors.after).toBeNull();
  });

  it("retrieves a single conversation", async () => {
    const { fetchMock, calls } = setupFetch({
      data: {
        id: "conv-1",
        phone_number: "+15551234567",
        status: "active",
        phone_number_id: "123"
      }
    });

    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });

    const conversation = await client.conversations.get({ conversationId: "conv-1" });

    expect(calls[0]?.url).toContain("/v23.0/conversations/conv-1");
    expect(conversation).toMatchObject({ id: "conv-1", phoneNumber: "+15551234567", phoneNumberId: "123" });
    expectTypeOf(conversation.status).toBeString();
  });

  it("retrieves a single conversation when response is bare object", async () => {
    const { fetchMock } = setupFetch({
      id: "conv-2",
      phone_number: "+15559876543",
      status: "resolved",
      phone_number_id: "456"
    });

    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });

    const conversation = await client.conversations.get({ conversationId: "conv-2" });

    expect(conversation).toMatchObject({
      id: "conv-2",
      phoneNumber: "+15559876543",
      phoneNumberId: "456",
      status: "resolved"
    });
  });

  it("updates conversation status", async () => {
    const { fetchMock, calls } = setupFetch({ success: true });
    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });

    const response = await client.conversations.updateStatus({ conversationId: "conv-1", status: "ended" });

    expect(calls[0]?.url).toContain("/v23.0/conversations/conv-1");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ status: "ended" });
    expect(response).toEqual({ success: true });
  });

  it("includes Kapso extras when fields are requested", async () => {
    const { fetchMock } = setupFetch({
      data: [
        {
          id: "conv-3",
          phone_number: "+15550001111",
          status: "active",
          last_active_at: "2025-01-01T00:00:00Z",
          phone_number_id: "123",
          kapso: {
            contact_name: "Alice",
            messages_count: 42,
            last_message_id: "wamid.latest",
            last_message_type: "text",
            last_message_timestamp: "2025-01-01T00:00:00Z",
            last_message_text: "Hello",
            last_inbound_at: "2025-01-01T00:00:00Z",
            last_outbound_at: "2025-01-01T00:00:00Z"
          }
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });

    const client = new WhatsAppClient({ baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: "key", fetch: fetchMock });
    const page = await client.conversations.list({ phoneNumberId: "123", limit: 1, fields: "kapso(contact_name)" });
    const conv = page.data[0];
    expect(conv.kapso?.contactName).toBe("Alice");
  });
});
