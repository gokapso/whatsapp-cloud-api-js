import { describe, expect, expectTypeOf, it } from "vitest";
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
          last_active_at: "2025-01-01T12:00:00Z"
        }
      ],
      meta: { page: 1, per_page: 20, total_pages: 1, total_count: 1 }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.conversations.list({
      phoneNumberId: "123",
      status: "active",
      lastActiveSince: "2025-01-01T00:00:00Z",
      page: 1,
      perPage: 20
    });

    expect(calls[0]?.url).toContain("https://graph.facebook.com/v23.0/123/conversations?");
    expect(calls[0]?.url).toContain("status=active");
    expect(calls[0]?.url).toContain("last_active_since=2025-01-01T00%3A00%3A00Z");
    expect(result.data[0]).toMatchObject({
      id: "conv-1",
      phoneNumber: "+15551234567",
      status: "active",
      lastActiveAt: "2025-01-01T12:00:00Z"
    });
    expect(result.meta).toMatchObject({ page: 1, perPage: 20, totalPages: 1, totalCount: 1 });
    expectTypeOf(result.data[0].status).toBeString();
  });

  it("retrieves a single conversation", async () => {
    const { fetchMock, calls } = setupFetch({
      data: {
        id: "conv-1",
        phone_number: "+15551234567",
        status: "active"
      }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const conversation = await client.conversations.get({ conversationId: "conv-1" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/conversations/conv-1");
    expect(conversation).toMatchObject({ id: "conv-1", phoneNumber: "+15551234567" });
    expectTypeOf(conversation.status).toBeString();
  });

  it("updates conversation status", async () => {
    const { fetchMock, calls } = setupFetch({ success: true });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const response = await client.conversations.updateStatus({ conversationId: "conv-1", status: "ended" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/conversations/conv-1");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ status: "ended" });
    expect(response).toEqual({ success: true });
  });
});
