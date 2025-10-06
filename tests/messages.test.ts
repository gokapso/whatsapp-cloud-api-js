import { describe, expect, expectTypeOf, it } from "vitest";
import { WhatsAppClient } from "../src";

const defaultGraphResponse = {
  messaging_product: "whatsapp",
  contacts: [{ input: "15551234567", wa_id: "15551234567" }],
  messages: [{ id: "wamid.TEST", message_status: "accepted" as const }]
} as const;

const expectedClientResponse = {
  messagingProduct: "whatsapp" as const,
  contacts: [{ input: "15551234567", waId: "15551234567" }],
  messages: [{ id: "wamid.TEST", messageStatus: "accepted" as const }]
} as const;

describe("Messages resource", () => {
  const setupFetch = (payload: unknown = defaultGraphResponse) => {
    const responses: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      responses.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    return { fetchMock, responses } as const;
  };

  it("sends a text message with required fields", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.messages.sendText({
      phoneNumberId: "123",
      to: "15551234567",
      body: "Hello from Kapso",
      previewUrl: false
    });

    expect(responses[0]?.url).toBe("https://graph.facebook.com/v23.0/123/messages");
    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "text",
      text: {
        body: "Hello from Kapso",
        preview_url: false
      }
    });
    expect(result).toEqual(expectedClientResponse);
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result.messagingProduct).toEqualTypeOf<"whatsapp">();
    const message = result.messages[0];
    expect(message).toBeDefined();
    expectTypeOf(message).not.toBeAny();
    expectTypeOf(message).toMatchTypeOf<{
      id: string;
      messageStatus?: "accepted" | "held_for_quality_assessment";
    }>();
    // @ts-expect-error invalid status should not be assignable once types exist
    result.messages[0].messageStatus = "invalid_status";
  });

  it("fails validation when text body missing", async () => {
    const { fetchMock } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await expect(
      client.messages.sendText({
        phoneNumberId: "123",
        to: "15551234567",
        body: ""
      })
    ).rejects.toThrowError(/body/);
  });

  it("sends an image message using media id", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendImage({
      phoneNumberId: "123",
      to: "15551234567",
      image: { id: "MEDIA123", caption: "Check this out" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "image",
      image: { id: "MEDIA123", caption: "Check this out" }
    });
  });

  it("sends a document message with filename", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendDocument({
      phoneNumberId: "123",
      to: "15551234567",
      document: { link: "https://example.com/file.pdf", filename: "invoice.pdf" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "document",
      document: { link: "https://example.com/file.pdf", filename: "invoice.pdf" }
    });
  });

  it("throws when media reference missing id and link", async () => {
    const { fetchMock } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await expect(
      client.messages.sendAudio({
        phoneNumberId: "123",
        to: "15551234567",
        audio: {} as unknown as { id?: string; link?: string }
      })
    ).rejects.toThrowError(/Either id or link must be provided/);
  });

  it("sends an audio message using link", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendAudio({
      phoneNumberId: "123",
      to: "15551234567",
      audio: { link: "https://example.com/audio.mp3" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "audio",
      audio: { link: "https://example.com/audio.mp3" }
    });
  });

  it("sends a reaction message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendReaction({
      phoneNumberId: "123",
      to: "15551234567",
      reaction: { messageId: "wamid.XYZ", emoji: "😀" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "reaction",
      reaction: { message_id: "wamid.XYZ", emoji: "😀" }
    });
  });

  it("sends interactive reply buttons", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveButtons({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Pick an option",
      buttons: [
        { id: "accept", title: "Accept" },
        { id: "decline", title: "Decline" }
      ],
      header: { type: "text", text: "Header" },
      footerText: "Footer"
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Pick an option" },
        footer: { text: "Footer" }
      }
    });
  });

  it("sends an interactive list message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveList({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Choose an option",
      buttonText: "View",
      sections: [
        {
          title: "Section 1",
          rows: [{ id: "opt1", title: "Option 1" }]
        }
      ],
      header: { type: "text", text: "Menu" },
      footerText: "Footer"
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "list",
        action: { button: "View" }
      }
    });
  });

  it("sends a product interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveProduct({
      phoneNumberId: "123",
      to: "15551234567",
      catalogId: "CAT123",
      productRetailerId: "SKU-1",
      bodyText: "Our latest item"
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "product",
        action: {
          catalog_id: "CAT123",
          product_retailer_id: "SKU-1"
        }
      }
    });
  });

  it("sends a product list interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveProductList({
      phoneNumberId: "123",
      to: "15551234567",
      catalogId: "CAT123",
      bodyText: "Catalog",
      sections: [
        {
          title: "Featured",
          productItems: [{ productRetailerId: "SKU-1" }]
        }
      ]
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "product_list",
        action: { catalog_id: "CAT123" }
      }
    });
  });

  it("sends a flow interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveFlow({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Start flow",
      parameters: {
        flowId: "FLOW123",
        flowAction: "navigate",
        flowActionPayload: { screen: "welcome" }
      }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "flow",
        action: {
          parameters: {
            flow_id: "FLOW123",
            flow_action: "navigate"
          }
        }
      }
    });
  });

  it("sends an address interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveAddress({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Share delivery address",
      parameters: {
        country: "IN",
        values: {
          name: "John Doe"
        }
      }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "address_message",
        action: {
          name: "address_message"
        }
      }
    });
  });

  it("sends a location request interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveLocationRequest({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Share your location",
      parameters: {
        requestMessage: "We need your location"
      }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "location_request_message",
        action: {
          name: "location_request_message"
        }
      }
    });
  });

  it("sends a call permission request interactive message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendInteractiveCallPermission({
      phoneNumberId: "123",
      to: "15551234567",
      bodyText: "Can we call you?",
      parameters: {
        phoneNumber: "+15551234567",
        callPurpose: "Support"
      }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        action: {
          parameters: {
            phone_number: "+15551234567"
          }
        }
      }
    });
  });

  it("sends a location message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendLocation({
      phoneNumberId: "123",
      to: "15551234567",
      location: { latitude: 1.23, longitude: 4.56, name: "HQ", address: "123 Main St" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "location",
      location: { latitude: 1.23, longitude: 4.56 }
    });
  });

  it("sends contacts payload", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendContacts({
      phoneNumberId: "123",
      to: "15551234567",
      contacts: [
        {
          name: { formattedName: "John Doe" },
          phones: [{ phone: "+15551234567", type: "WORK" }]
        }
      ]
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "contacts",
      contacts: [
        {
          name: { formatted_name: "John Doe" }
        }
      ]
    });
  });

  it("sends a template message", async () => {
    const { fetchMock, responses } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.sendTemplate({
      phoneNumberId: "123",
      to: "15551234567",
      template: {
        name: "order_confirmation",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "John" }
            ]
          }
        ]
      }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      type: "template",
      template: {
        name: "order_confirmation",
        language: { code: "en_US" }
      }
    });
  });

  it("marks a message as read via status payload", async () => {
    const { fetchMock, responses } = setupFetch({ success: true });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.messages.markRead({
      phoneNumberId: "123",
      messageId: "wamid.ABCD"
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.ABCD"
    });
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });

  it("marks a message as read and sets typing indicator", async () => {
    const { fetchMock, responses } = setupFetch({ success: true });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.messages.markRead({
      phoneNumberId: "123",
      messageId: "wamid.TYPING",
      typingIndicator: { type: "text" }
    });

    const parsedBody = JSON.parse(String(responses[0]?.init.body));
    expect(parsedBody).toMatchObject({
      typing_indicator: { type: "text" }
    });
  });
});
