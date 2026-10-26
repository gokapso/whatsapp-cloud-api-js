import { describe, expect, it } from "vitest";
import { getTappedOption, normalizeKapsoWebhook, normalizeWebhook } from "../src/server";

// A quick reply tapped on a free-form carousel card, as delivered through a Kapso
// webhook (payload v2). Meta sends it as type "button", like template quick replies,
// not as interactive.button_reply. Kapso mirrors text and payload in message_type_data.
const carouselTap = {
  phone_number_id: "123456789012345",
  is_new_conversation: false,
  conversation: { id: "conv_123", phone_number: "+15551234567", phone_number_id: "123456789012345", contact_name: "John Doe" },
  message: {
    id: "wamid.tap",
    from: "15551234567",
    type: "button",
    timestamp: "1761500000",
    button: { text: "Remove", payload: "cart-rm:item_1" },
    context: { id: "wamid.carousel", from: "15550000000" },
    username: null,
    kapso: { origin: "cloud_api", direction: "inbound", content: "Remove", message_type_data: { text: "Remove", payload: "cart-rm:item_1" } }
  }
};

// The same tap in Meta's Graph webhook shape, after a template quick reply.
const metaButtonWebhook = {
  object: "whatsapp_business_account",
  entry: [{
    id: "WABA",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550000000", phone_number_id: "123456789012345" },
        contacts: [{ profile: { name: "John Doe" }, wa_id: "15551234567" }],
        messages: [{
          from: "15551234567",
          id: "wamid.tap",
          timestamp: "1761500000",
          type: "button",
          button: { payload: "Unsubscribe", text: "Unsubscribe" },
          context: { from: "15550000000", id: "wamid.template" }
        }]
      }
    }]
  }]
};

describe("getTappedOption", () => {
  it("reads a carousel card quick reply from a Kapso webhook", () => {
    const result = normalizeKapsoWebhook(carouselTap, { headers: { "x-webhook-event": "whatsapp.message.received" } });
    const [message] = result.messages;

    expect(message.type).toBe("button");
    expect(message.button).toEqual({ text: "Remove", payload: "cart-rm:item_1" });
    expect(message.context?.id).toBe("wamid.carousel");
    expect(getTappedOption(message)).toEqual({ id: "cart-rm:item_1", title: "Remove", source: "button" });
  });

  it("reads a template quick reply from a Meta webhook", () => {
    const result = normalizeWebhook(metaButtonWebhook);
    const [message] = result.messages;

    expect(message.type).toBe("button");
    expect(getTappedOption(message)).toEqual({ id: "Unsubscribe", title: "Unsubscribe", source: "button" });
  });

  it("falls back to kapso.messageTypeData when button is missing", () => {
    const message = { id: "m", type: "button", timestamp: "1", kapso: { messageTypeData: { text: "Pay", payload: "pay:1" } } };
    expect(getTappedOption(message)).toEqual({ id: "pay:1", title: "Pay", source: "button" });
  });

  it("reads reply buttons and list rows, camelCased or raw", () => {
    const buttonReply = { id: "m", type: "interactive", timestamp: "1", interactive: { type: "button_reply", buttonReply: { id: "yes", title: "Yes" } } };
    const rawButtonReply = { id: "m", type: "interactive", timestamp: "1", interactive: { type: "button_reply", button_reply: { id: "yes", title: "Yes" } } };
    const listReply = { id: "m", type: "interactive", timestamp: "1", interactive: { type: "list_reply", listReply: { id: "size_27", title: "27", description: "In stock" } } };

    expect(getTappedOption(buttonReply)).toEqual({ id: "yes", title: "Yes", source: "button_reply" });
    expect(getTappedOption(rawButtonReply)).toEqual({ id: "yes", title: "Yes", source: "button_reply" });
    expect(getTappedOption(listReply)).toEqual({ id: "size_27", title: "27", description: "In stock", source: "list_reply" });
  });

  it("returns undefined for anything that is not a tap", () => {
    expect(getTappedOption({ id: "m", type: "text", timestamp: "1", text: { body: "hi" } })).toBeUndefined();
    expect(getTappedOption({ id: "m", type: "interactive", timestamp: "1", interactive: { type: "nfm_reply", nfmReply: { responseJson: "{}" } } })).toBeUndefined();
    expect(getTappedOption({ id: "m", type: "button", timestamp: "1" })).toBeUndefined();
    expect(getTappedOption(undefined)).toBeUndefined();
    expect(getTappedOption(null)).toBeUndefined();
  });
});
