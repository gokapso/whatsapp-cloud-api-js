import { describe, expect, it } from "vitest";
import { WhatsAppClient, buildKapsoMessageFields } from "../src";

describe("Message media fields selector", () => {
  const setupFetch = (payload: unknown) => {
    const calls: Array<{ url: string; init: RequestInit }>= [];
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

  it("passes fields=kapso(media_url) and types mediaUrl", async () => {
    const payload = {
      data: [
        {
          id: "wamid.1",
          type: "image",
          timestamp: "1735689600",
          image: { id: "MEDIA1" },
          kapso: { media_url: "https://app.kapso.ai/rails/active_storage/blobs/abc" }
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    };

    const { fetchMock, calls } = setupFetch(payload);
    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });

    const fields = buildKapsoMessageFields("media_url");
    const page = await client.messages.listByConversation({
      phoneNumberId: "123",
      conversationId: "conv-1",
      fields
    });

    const url = calls[0]?.url ?? "";
    // URL will be percent-encoded; parentheses become %28 and %29
    expect(url).toContain("fields=kapso%28media_url%29");
    expect(page.data[0]?.kapso?.mediaUrl).toBe("https://app.kapso.ai/rails/active_storage/blobs/abc");
  });
});
