import { describe, expect, it } from "vitest";
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
          type: "text",
          timestamp: "1735689600",
          text: { body: "Hello" },
          kapso: { status: "delivered", direction: "inbound" }
        }
      ],
      paging: {
        cursors: { before: null, after: null },
        next: null,
        previous: null
      }
    });

    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });

    const result = await client.messages.query({
      phoneNumberId: "123",
      direction: "inbound",
      since: "2025-01-01T00:00:00Z",
      limit: 50
    });

    expect(calls[0]?.url).toContain("/v23.0/123/messages?");
    expect(calls[0]?.url).toContain("direction=inbound");
    expect(result.data[0]).toMatchObject({ id: "msg-1", type: "text", timestamp: "1735689600" });
    expect(result.data[0].kapso).toMatchObject({ status: "delivered", direction: "inbound" });
    expect(result.paging.cursors.before).toBeNull();
    expect(result.paging.next).toBeNull();
  });

  it("strips undefined filters and includes date bounds", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });
    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });

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
          type: "image",
          timestamp: "1735689700",
          image: { caption: "Look" }
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });

    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });

    const page = await client.messages.listByConversation({
      phoneNumberId: "123",
      conversationId: "conv-1",
      limit: 25
    });

    expect(calls[0]?.url).toContain("/v23.0/123/messages");
    expect(calls[0]?.url).toContain("conversation_id=conv-1");
    expect(page.data[0]).toMatchObject({ id: "msg-2", type: "image" });
    expect(page.paging.cursors.after).toBeNull();
  });

  it("parses specialized message payloads mirroring Meta", async () => {
    const { fetchMock } = setupFetch({
      data: [
        {
          id: "msg-order",
          type: "order",
          timestamp: "1735689800",
          order: {
            catalog_id: "CAT123",
            product_items: [
              { product_retailer_id: "SKU-1", quantity: "1" },
              { product_retailer_id: "SKU-2", quantity: "2" }
            ],
            order_text: "Thanks for your order!"
          },
          kapso: {
            message_type_data: {
              catalog_id: "CAT123",
              product_items: [
                { product_retailer_id: "SKU-1", quantity: "1" },
                { product_retailer_id: "SKU-2", quantity: "2" }
              ]
            }
          }
        },
        {
          id: "msg-sticker",
          type: "sticker",
          timestamp: "1735689810",
          sticker: {
            id: "STICKER_ID",
            mime_type: "image/webp",
            animated: true
          }
        },
        {
          id: "msg-template",
          type: "template",
          timestamp: "1735689820",
          template: {
            name: "shipping_update",
            language: { code: "en_US" },
            components: [
              {
                type: "BODY",
                parameters: [
                  { type: "text", text: "John" }
                ]
              }
            ]
          }
        },
        {
          id: "msg-flow",
          type: "interactive",
          timestamp: "1735689830",
          context: {
            id: "wamid.original",
            from: "16315558151",
            referred_product: {
              catalog_id: "CATREF",
              product_retailer_id: "SKU-REF"
            }
          },
          interactive: {
            type: "nfm_reply",
            nfm_reply: {
              name: "feedback_flow",
              response_json: "{\"rating\":\"5\",\"comment\":\"Great!\"}"
            }
          },
          kapso: {
            flow_response: {
              rating: "5",
              comment: "Great!"
            }
          }
        }
      ],
      paging: {
        cursors: { before: null, after: null },
        next: null,
        previous: null
      }
    });

    const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", fetch: fetchMock });
    const result = await client.messages.query({ phoneNumberId: "123" });

    const orderMessage = result.data.find((item) => item.id === "msg-order");
    expect(orderMessage?.order?.catalogId).toBe("CAT123");
    expect(orderMessage?.order?.productItems).toHaveLength(2);
    expect(orderMessage?.order?.orderText).toBe("Thanks for your order!");
    expect(orderMessage?.kapso?.messageTypeData).toMatchObject({ catalogId: "CAT123" });

    const stickerMessage = result.data.find((item) => item.id === "msg-sticker");
    expect(stickerMessage?.sticker).toMatchObject({ mimeType: "image/webp", animated: true });

    const templateMessage = result.data.find((item) => item.id === "msg-template");
    expect(templateMessage?.template).toMatchObject({
      name: "shipping_update",
      language: { code: "en_US" }
    });
    expect(templateMessage?.template?.components?.[0]).toMatchObject({ type: "BODY" });

    const flowMessage = result.data.find((item) => item.id === "msg-flow");
    expect(flowMessage?.context?.referredProduct).toMatchObject({
      catalogId: "CATREF",
      productRetailerId: "SKU-REF"
    });
    expect(flowMessage?.interactive).toMatchObject({ type: "nfm_reply" });
    expect(flowMessage?.kapso?.flowResponse).toMatchObject({ rating: "5" });
  });
});
