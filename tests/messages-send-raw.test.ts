import { describe, expect, it } from "vitest";

import { WhatsAppClient } from "../src";

describe("Messages raw send API", () => {
  it("sends a raw payload through the shared transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify({
        contacts: [{ input: "+15551234567", wa_id: "15551234567" }],
        messages: [{ id: "wamid.123" }],
        messaging_product: "whatsapp"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const response = await client.messages.sendRaw({
      phoneNumberId: "123",
      payload: {
        messagingProduct: "whatsapp",
        to: "+15551234567",
        type: "text",
        text: { body: "Hello from raw" }
      }
    });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "+15551234567",
      type: "text",
      text: { body: "Hello from raw" }
    });
    expect(response).toMatchObject({
      messagingProduct: "whatsapp",
      messages: [{ id: "wamid.123" }]
    });
  });
});
