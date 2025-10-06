import { describe, expect, expectTypeOf, it } from "vitest";
import { WhatsAppClient } from "../src";

describe("Message history API", () => {
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

  it("queries messages for a phone number with filters", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "msg-1",
          message_type: "text",
          content: "Hello",
          direction: "inbound",
          status: "delivered",
          created_at: "2025-01-01T12:00:00Z"
        }
      ],
      meta: { page: 1, per_page: 50, total_pages: 1, total_count: 1 }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.messages.query({
      phoneNumberId: "123",
      direction: "inbound",
      since: "2025-01-01T00:00:00Z",
      perPage: 50
    });

    expect(calls[0]?.url).toContain("https://graph.facebook.com/v23.0/123/messages?");
    expect(calls[0]?.url).toContain("direction=inbound");
    expect(result.data[0]).toMatchObject({ id: "msg-1", messageType: "text", createdAt: "2025-01-01T12:00:00Z" });
    expect(result.meta?.perPage).toBe(50);
    expectTypeOf(result.data[0].metadata).toBeAny();
  });

  it("strips undefined filters and includes date bounds", async () => {
    const { fetchMock, calls } = setupFetch({ data: [], meta: null });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.query({
      phoneNumberId: "123",
      since: "2025-02-01T00:00:00Z",
      until: "2025-02-15T23:59:59Z",
      direction: undefined,
      status: undefined
    });

    const url = calls[0]?.url ?? "";
    expect(url).toContain("since=2025-02-01T00%3A00%3A00Z");
    expect(url).toContain("until=2025-02-15T23%3A59%3A59Z");
    expect(url).not.toContain("direction=undefined");
    expect(url).not.toContain("status=undefined");
  });

  it("lists messages for a single conversation", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "msg-2",
          message_type: "image",
          metadata: { caption: "Look" }
        }
      ],
      meta: { page: 1, per_page: 25, total_pages: 1, total_count: 1 }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const page = await client.messages.listByConversation({
      phoneNumberId: "123",
      conversationId: "conv-1",
      perPage: 25
    });

    expect(calls[0]?.url).toContain("https://graph.facebook.com/v23.0/123/messages");
    expect(calls[0]?.url).toContain("conversation_id=conv-1");
    expect(page.data[0]).toMatchObject({ id: "msg-2", messageType: "image" });
    expect(page.meta?.totalCount).toBe(1);
  });
});
