import { describe, expect, expectTypeOf, it } from "vitest";
import {
  KAPSO_WEBHOOK_HEADERS,
  getKapsoSender,
  isKapsoWebhookPayload,
  normalizeKapsoWebhook,
  normalizeWebhook,
  readKapsoWebhookHeaders,
  signKapsoWebhook,
  verifyKapsoWebhookSignature
} from "../src/server";
import type { NormalizedKapsoWebhookResult, NormalizedWebhookResult } from "../src/server";

// Fixtures follow the payloads documented at docs.kapso.ai (platform/webhooks).

const conversation = {
  id: "conv_123",
  phone_number: "+15551234567",
  status: "active",
  last_active_at: "2025-10-28T14:25:01Z",
  created_at: "2025-10-28T13:40:00Z",
  updated_at: "2025-10-28T14:25:01Z",
  metadata: {},
  phone_number_id: "123456789012345",
  contact_name: "John Doe",
  kapso: {
    messages_count: 1,
    last_message_id: "wamid.123",
    last_message_type: "text",
    last_message_timestamp: "2025-10-28T14:25:01Z",
    last_message_text: "Hello",
    last_inbound_at: "2025-10-28T14:25:01Z",
    last_outbound_at: null
  }
};

const received = {
  message: {
    id: "wamid.123",
    from: "15551234567",
    from_user_id: "US.13491208655302741918",
    from_parent_user_id: null,
    username: null,
    timestamp: "1730092800",
    type: "text",
    text: { body: "Hello" },
    kapso: {
      direction: "inbound",
      status: "received",
      processing_status: "pending",
      origin: "cloud_api",
      has_media: false,
      content: "Hello"
    }
  },
  conversation,
  is_new_conversation: true,
  phone_number_id: "123456789012345"
};

const delivered = {
  message: {
    id: "wamid.456",
    to: "15551234567",
    timestamp: "1730092888",
    type: "text",
    text: { body: "On my way" },
    kapso: {
      direction: "outbound",
      status: "delivered",
      processing_status: "completed",
      origin: "cloud_api",
      has_media: false,
      statuses: [
        { id: "wamid.456", status: "sent", timestamp: "1730092860", recipient_id: "15551234567" },
        {
          id: "wamid.456",
          status: "delivered",
          timestamp: "1730092888",
          recipient_id: "15551234567",
          pricing: { billable: true, pricing_model: "PMP", category: "service" }
        }
      ]
    }
  },
  conversation,
  is_new_conversation: false,
  phone_number_id: "123456789012345"
};

const failed = {
  message: {
    id: "wamid.789",
    to: "15551234567",
    timestamp: "1730093200",
    type: "text",
    text: { body: "This message failed" },
    kapso: {
      direction: "outbound",
      status: "failed",
      processing_status: "completed",
      origin: "cloud_api",
      has_media: false,
      statuses: [
        { id: "wamid.789", status: "sent", timestamp: "1730093100", recipient_id: "15551234567" },
        {
          id: "wamid.789",
          status: "failed",
          timestamp: "1730093200",
          recipient_id: "15551234567",
          errors: [
            {
              code: 131047,
              title: "Re-engagement message",
              message: "More than 24 hours have passed since the recipient last replied"
            }
          ]
        }
      ]
    }
  },
  conversation,
  is_new_conversation: false,
  phone_number_id: "123456789012345"
};

function headersFor(event: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  return { ...(event ? { "X-Webhook-Event": event } : {}), "X-Idempotency-Key": "delivery_abc", "X-Webhook-Payload-Version": "v2", ...extra };
}

describe("normalizeKapsoWebhook", () => {
  it("produces a NormalizedWebhookResult-compatible result", () => {
    expectTypeOf<NormalizedKapsoWebhookResult>().toMatchTypeOf<NormalizedWebhookResult>();
    const result = normalizeKapsoWebhook(received, { headers: headersFor("whatsapp.message.received") });
    expect(result.calls).toEqual([]);
    expect(result.raw["whatsapp.message.received"]).toHaveLength(1);
  });

  it("normalizes a single whatsapp.message.received delivery", () => {
    const result = normalizeKapsoWebhook(received, { headers: headersFor("whatsapp.message.received") });

    expect(result.event).toBe("whatsapp.message.received");
    expect(result.idempotencyKey).toBe("delivery_abc");
    expect(result.payloadVersion).toBe("v2");
    expect(result.batch).toBe(false);
    expect(result.phoneNumberId).toBe("123456789012345");
    expect(result.statuses).toEqual([]);

    expect(result.messages).toHaveLength(1);
    const [message] = result.messages;
    expect(message.id).toBe("wamid.123");
    expect(message.from).toBe("15551234567");
    expect(message.fromUserId).toBe("US.13491208655302741918");
    expect(message.text?.body).toBe("Hello");
    expect(message.kapso?.direction).toBe("inbound");
    expect(message.kapso?.processingStatus).toBe("pending");
    expect(message.kapso?.origin).toBe("cloud_api");
    expect(message.kapso?.hasMedia).toBe(false);
    expect(message.kapso?.contactName).toBe("John Doe");
    expect(message.kapso?.whatsappConversationId).toBe("conv_123");
    expect(message.kapso?.phoneNumberId).toBe("123456789012345");

    expect(result.contacts).toEqual([
      { waId: "15551234567", userId: "US.13491208655302741918", profile: { name: "John Doe" } }
    ]);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe("conv_123");
    expect(result.conversations[0].kapso?.messagesCount).toBe(1);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].isNewConversation).toBe(true);
    expect(result.events[0].conversation?.phoneNumber).toBe("+15551234567");
    expect(result.events[0].message).toBe(message);
  });

  it("keeps a sender identified only by a business-scoped user ID", () => {
    const payload = {
      phone_number_id: "123456789012345",
      conversation: { id: "conv_bsuid", phone_number: null, phone_number_id: "123456789012345", business_scoped_user_id: "US.13491208655302741918", username: "@johndoe" },
      message: {
        id: "wamid.bsuid",
        from: null,
        from_user_id: "US.13491208655302741918",
        username: "@johndoe",
        timestamp: "1730092800",
        type: "text",
        text: { body: "hi" },
        kapso: { direction: "inbound", status: "received" }
      }
    };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.message.received") });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].from).toBeUndefined();
    expect(getKapsoSender(result.messages[0])).toEqual({ recipient: "US.13491208655302741918" });
    expect(result.contacts).toEqual([{ userId: "US.13491208655302741918", profile: { username: "@johndoe" } }]);
  });

  it("drops null identity fields so the message matches the MetaMessage type", () => {
    const payload = {
      phone_number_id: "123456789012345",
      is_new_conversation: false,
      conversation: { ...conversation, business_scoped_user_id: null, parent_business_scoped_user_id: null, username: null },
      message: {
        ...received.message,
        from_user_id: null,
        from_parent_user_id: null,
        to: null,
        to_user_id: null,
        to_parent_user_id: null,
        username: null,
        context: null
      }
    };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.message.received") });

    expect(result.messages).toHaveLength(1);
    const [message] = result.messages;
    expect(message.from).toBe("15551234567");
    expect(message).not.toHaveProperty("fromUserId");
    expect(message).not.toHaveProperty("fromParentUserId");
    expect(message).not.toHaveProperty("to");
    expect(message).not.toHaveProperty("toUserId");
    expect(message).not.toHaveProperty("toParentUserId");
    // username and context are declared nullable and pass through as sent.
    expect(message.username).toBeNull();
    expect(message.context).toBeNull();
    expect(getKapsoSender(message)).toEqual({ to: "15551234567" });
    expect(result.contacts).toEqual([{ waId: "15551234567", profile: { name: "John Doe" } }]);
  });

  it("unwraps a batch envelope and takes the event from the envelope type", () => {
    const second = {
      ...received,
      message: { ...received.message, id: "wamid.124", text: { body: "Anyone there?" } },
      is_new_conversation: false
    };
    const envelope = {
      type: "whatsapp.message.received",
      batch: true,
      data: [received, second],
      batch_info: { size: 2, window_ms: 5000, first_sequence: 101, last_sequence: 102, conversation_id: "conv_123" }
    };
    const result = normalizeKapsoWebhook(envelope, {
      headers: { "x-webhook-batch": "true", "x-batch-size": "2", "x-idempotency-key": "batch_1" }
    });

    expect(result.batch).toBe(true);
    expect(result.event).toBe("whatsapp.message.received");
    expect(result.idempotencyKey).toBe("batch_1");
    expect(result.batchInfo).toEqual({ size: 2, windowMs: 5000, firstSequence: 101, lastSequence: 102, conversationId: "conv_123" });
    expect(result.events.map((event) => event.message?.id)).toEqual(["wamid.123", "wamid.124"]);
    expect(result.messages.map((message) => message.text?.body)).toEqual(["Hello", "Anyone there?"]);
    expect(result.events[0].isNewConversation).toBe(true);
    expect(result.events[1].isNewConversation).toBe(false);
    expect(result.conversations).toHaveLength(1);
    expect(result.contacts).toHaveLength(1);
  });

  it("treats a buffered single message as a batch too", () => {
    const result = normalizeKapsoWebhook({ type: "whatsapp.message.received", batch: true, data: [received] });
    expect(result.batch).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("derives status updates from whatsapp.message.delivered using the status history", () => {
    const result = normalizeKapsoWebhook(delivered, { headers: headersFor("whatsapp.message.delivered") });

    expect(result.messages).toEqual([]);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0]).toMatchObject({
      id: "wamid.456",
      status: "delivered",
      timestamp: "1730092888",
      recipientId: "15551234567",
      pricing: { billable: true, pricingModel: "PMP", category: "service" }
    });
    expect(result.events[0].message?.kapso?.direction).toBe("outbound");
    expect(result.events[0].message?.kapso?.statuses).toHaveLength(2);
    expect(result.contacts[0]).toMatchObject({ waId: "15551234567", profile: { name: "John Doe" } });
  });

  it("keeps the errors of whatsapp.message.failed", () => {
    const result = normalizeKapsoWebhook(failed, { headers: headersFor("whatsapp.message.failed") });

    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0].status).toBe("failed");
    expect(result.statuses[0].errors?.[0]).toMatchObject({ code: 131047, title: "Re-engagement message" });
  });

  it("falls back to message fields when the status history is missing", () => {
    const payload = {
      message: { id: "wamid.nohist", to: "15551234567", timestamp: "1730092860", type: "text", text: { body: "x" }, kapso: { direction: "outbound", status: "sent" } },
      conversation,
      phone_number_id: "123456789012345"
    };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.message.sent") });
    expect(result.statuses).toEqual([{ id: "wamid.nohist", status: "sent", timestamp: "1730092860", recipientId: "15551234567" }]);
  });

  it("recognizes a status delivery from kapso.status when no event name is available", () => {
    const result = normalizeKapsoWebhook(delivered);
    expect(result.event).toBeUndefined();
    expect(result.messages).toEqual([]);
    expect(result.statuses[0]).toMatchObject({ id: "wamid.456", status: "delivered" });
  });

  it("keeps outbound echoes out of messages but in events", () => {
    const echo = {
      ...received,
      message: { ...received.message, id: "wamid.echo", from: undefined, to: "15551234567", kapso: { direction: "outbound", status: "sent", origin: "business_app" } }
    };
    const result = normalizeKapsoWebhook(echo, { headers: headersFor("whatsapp.message.received") });

    expect(result.messages).toEqual([]);
    expect(result.statuses).toEqual([]);
    expect(result.events[0].message?.id).toBe("wamid.echo");
    expect(result.events[0].message?.kapso?.origin).toBe("business_app");
  });

  it("infers direction from the event name when kapso.direction is missing", () => {
    const bare = { ...received, message: { ...received.message, kapso: undefined } };
    const result = normalizeKapsoWebhook(bare, { headers: headersFor("whatsapp.message.received") });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].kapso?.direction).toBe("inbound");
  });

  it("normalizes conversation lifecycle events without a message", () => {
    const created = normalizeKapsoWebhook({ conversation, phone_number_id: "123456789012345" }, { headers: headersFor("whatsapp.conversation.created") });
    expect(created.messages).toEqual([]);
    expect(created.events[0].event).toBe("whatsapp.conversation.created");
    expect(created.events[0].conversation?.id).toBe("conv_123");
    expect(created.conversations).toHaveLength(1);
    expect(created.contacts).toEqual([{ waId: "15551234567", profile: { name: "John Doe" } }]);

    const inactive = normalizeKapsoWebhook(
      {
        conversation,
        since_message: { id: "msg_anchor", whatsapp_message_id: "wamid.ANCHOR", direction: "inbound", created_at: "2025-10-28T13:00:00Z" },
        inactivity: { minutes: 60 },
        phone_number_id: "123456789012345"
      },
      { headers: headersFor("whatsapp.conversation.inactive") }
    );
    expect(inactive.events[0].sinceMessage).toEqual({ id: "msg_anchor", whatsappMessageId: "wamid.ANCHOR", direction: "inbound", createdAt: "2025-10-28T13:00:00Z" });
    expect(inactive.events[0].inactivity).toEqual({ minutes: 60 });
  });

  it("normalizes whatsapp.contact.identity_changed with null previous values", () => {
    const payload = {
      contact: {
        id: "contact_123",
        wa_id: "15551234567",
        profile_name: "John Doe",
        display_name: "John Doe",
        business_scoped_user_id: "US.13491208655302741918",
        parent_business_scoped_user_id: "US.ENT.506847293015824",
        username: "@testusername"
      },
      previous: { business_scoped_user_id: "US.OLD.13491208655302741918", parent_business_scoped_user_id: null },
      phone_number_id: "123456789012345"
    };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.contact.identity_changed") });

    expect(result.events[0].contact?.businessScopedUserId).toBe("US.13491208655302741918");
    expect(result.events[0].previous).toEqual({ businessScopedUserId: "US.OLD.13491208655302741918", parentBusinessScopedUserId: null });
    expect(result.contacts).toEqual([
      {
        waId: "15551234567",
        userId: "US.13491208655302741918",
        parentUserId: "US.ENT.506847293015824",
        profile: { name: "John Doe", username: "@testusername" }
      }
    ]);
    expect(result.messages).toEqual([]);
  });

  it("normalizes whatsapp.thread.standby as an inbound message with the standby block", () => {
    const payload = { standby: { kind: "shared_number" }, message: received.message, conversation, is_new_conversation: false, phone_number_id: "123456789012345" };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.thread.standby") });
    expect(result.events[0].standby).toEqual({ kind: "shared_number" });
    expect(result.messages).toHaveLength(1);
  });

  it("camelCases media and transcript extensions", () => {
    const audio = {
      message: {
        id: "wamid.790",
        from: "15551234567",
        timestamp: "1730093100",
        type: "audio",
        audio: { id: "media_id_456" },
        kapso: {
          direction: "inbound",
          has_media: true,
          transcript: { text: "Hello, I need help with my order" },
          media_url: "https://api.kapso.ai/media/abc",
          media_data: { url: "https://api.kapso.ai/media/abc", filename: "voice.ogg", content_type: "audio/ogg", byte_size: 51200 }
        }
      },
      conversation,
      phone_number_id: "123456789012345"
    };
    const result = normalizeKapsoWebhook(audio, { headers: headersFor("whatsapp.message.received") });
    const [message] = result.messages;
    expect(message.audio?.id).toBe("media_id_456");
    expect(message.kapso?.transcript?.text).toBe("Hello, I need help with my order");
    expect(message.kapso?.mediaUrl).toBe("https://api.kapso.ai/media/abc");
    expect(message.kapso?.mediaData).toEqual({ url: "https://api.kapso.ai/media/abc", filename: "voice.ogg", contentType: "audio/ogg", byteSize: 51200 });
  });

  it("hydrates Flow responses like the Meta normalizer does", () => {
    const flow = {
      message: {
        id: "wamid.flow",
        from: "15551234567",
        timestamp: "1730093100",
        type: "interactive",
        interactive: {
          type: "nfm_reply",
          nfm_reply: { name: "flow", body: "Sent", response_json: JSON.stringify({ flow_token: "tok_1", screen_0_Choice_0: "yes" }) }
        },
        kapso: { direction: "inbound" }
      },
      conversation,
      phone_number_id: "123456789012345"
    };
    const result = normalizeKapsoWebhook(flow, { headers: headersFor("whatsapp.message.received") });
    expect(result.messages[0].kapso?.flowToken).toBe("tok_1");
    expect(result.messages[0].kapso?.flowResponse).toEqual({ flowToken: "tok_1", screen0Choice0: "yes" });
  });

  it("reads headers from Fetch Headers and from Node header records", () => {
    const fetchHeaders = new Headers({
      "X-Webhook-Event": "whatsapp.message.received",
      "X-Idempotency-Key": "k1",
      "X-Webhook-Signature": "ab".repeat(32),
      "X-Webhook-Batch": "true",
      "X-Batch-Size": "3",
      "X-Webhook-Payload-Version": "v2"
    });
    expect(readKapsoWebhookHeaders(fetchHeaders)).toEqual({
      event: "whatsapp.message.received",
      idempotencyKey: "k1",
      signature: "ab".repeat(32),
      batch: true,
      batchSize: 3,
      payloadVersion: "v2"
    });

    const nodeHeaders = { "x-webhook-event": ["whatsapp.message.sent"], "X-IDEMPOTENCY-KEY": "k2", host: "example.com" };
    expect(readKapsoWebhookHeaders(nodeHeaders)).toEqual({
      event: "whatsapp.message.sent",
      idempotencyKey: "k2",
      signature: undefined,
      batch: false,
      batchSize: undefined,
      payloadVersion: undefined
    });

    expect(readKapsoWebhookHeaders({})).toEqual({ event: undefined, idempotencyKey: undefined, signature: undefined, batch: false, batchSize: undefined, payloadVersion: undefined });
    expect(KAPSO_WEBHOOK_HEADERS.event).toBe("x-webhook-event");
  });

  it("prefers the header event name over the envelope type", () => {
    const result = normalizeKapsoWebhook({ type: "whatsapp.message.received", batch: true, data: [received] }, { headers: headersFor("whatsapp.thread.standby") });
    expect(result.event).toBe("whatsapp.thread.standby");
  });

  it("uses defaultPhoneNumberId when the payload has none", () => {
    const payload = { message: { ...received.message }, conversation: { id: "conv_x" } };
    const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.message.received"), defaultPhoneNumberId: "pn_default" });
    expect(result.phoneNumberId).toBe("pn_default");
    expect(result.events[0].phoneNumberId).toBe("pn_default");
    expect(result.messages[0].kapso?.phoneNumberId).toBe("pn_default");
  });

  it("never throws on malformed or Meta-shaped input", () => {
    for (const payload of [null, undefined, "text", 42, [], {}, { batch: true, data: "nope" }, { data: [1, "two", null] }, { message: "not an object" }]) {
      const result = normalizeKapsoWebhook(payload, { headers: headersFor("whatsapp.message.received") });
      expect(result.messages).toEqual([]);
      expect(result.statuses).toEqual([]);
      expect(result.contacts).toEqual([]);
    }

    const meta = { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messages: [received.message] } }] }] };
    expect(isKapsoWebhookPayload(meta)).toBe(false);
    expect(normalizeKapsoWebhook(meta).events).toEqual([]);
    expect(normalizeWebhook(meta).messages).toHaveLength(1);
  });

  it("does not change what normalizeWebhook returns for Kapso payloads", () => {
    const viaMeta = normalizeWebhook(received);
    expect(viaMeta.messages).toEqual([]);
    expect(viaMeta.statuses).toEqual([]);
  });
});

describe("isKapsoWebhookPayload", () => {
  it("detects single events and batch envelopes", () => {
    expect(isKapsoWebhookPayload(received)).toBe(true);
    expect(isKapsoWebhookPayload({ type: "whatsapp.message.received", batch: true, data: [] })).toBe(true);
    expect(isKapsoWebhookPayload({ conversation, phone_number_id: "1" })).toBe(true);
    expect(isKapsoWebhookPayload({ contact: {}, previous: {}, phone_number_id: "1" })).toBe(true);
    expect(isKapsoWebhookPayload({ thread: {}, conversation })).toBe(true);
  });

  it("rejects Meta payloads and non-objects", () => {
    expect(isKapsoWebhookPayload({ object: "whatsapp_business_account", entry: [] })).toBe(false);
    expect(isKapsoWebhookPayload({})).toBe(false);
    expect(isKapsoWebhookPayload(null)).toBe(false);
    expect(isKapsoWebhookPayload("x")).toBe(false);
    expect(isKapsoWebhookPayload([])).toBe(false);
  });
});

describe("getKapsoSender", () => {
  it("returns to for phone numbers, recipient for BSUIDs, and both when both are present", () => {
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0", from: "15551234567" })).toEqual({ to: "15551234567" });
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0", fromUserId: "US.123" })).toEqual({ recipient: "US.123" });
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0", from: "15551234567", fromUserId: "US.ENT.123" })).toEqual({ to: "15551234567", recipient: "US.ENT.123" });
  });

  it("uses the recipient side on outbound echoes", () => {
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0", to: "15551234567", toUserId: "US.9", kapso: { direction: "outbound" } })).toEqual({ to: "15551234567", recipient: "US.9" });
  });

  it("ignores values that do not look like a BSUID and returns undefined when nothing is usable", () => {
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0", fromUserId: "not-a-bsuid" })).toBeUndefined();
    expect(getKapsoSender({ id: "1", type: "text", timestamp: "0" })).toBeUndefined();
  });
});

describe("signKapsoWebhook", () => {
  const secret = "webhook-secret";
  const rawBody = Buffer.from(JSON.stringify(received));

  it("round-trips with verifyKapsoWebhookSignature over the exact bytes", () => {
    const signature = signKapsoWebhook({ secret, rawBody });
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyKapsoWebhookSignature({ secret, rawBody, signatureHeader: signature })).toBe(true);
    expect(verifyKapsoWebhookSignature({ secret, rawBody: rawBody.toString("utf8"), signatureHeader: signature })).toBe(true);
    expect(signKapsoWebhook({ secret, rawBody: new Uint8Array(rawBody) })).toBe(signature);
    expect(signKapsoWebhook({ secret, rawBody: rawBody.toString("utf8") })).toBe(signature);
  });

  it("does not verify a reserialized body or a different secret", () => {
    const signature = signKapsoWebhook({ secret, rawBody });
    const reserialized = JSON.stringify(JSON.parse(rawBody.toString("utf8")), null, 2);
    expect(verifyKapsoWebhookSignature({ secret, rawBody: reserialized, signatureHeader: signature })).toBe(false);
    expect(verifyKapsoWebhookSignature({ secret: "other", rawBody, signatureHeader: signature })).toBe(false);
  });

  it("rejects invalid arguments", () => {
    expect(() => signKapsoWebhook({ secret: "", rawBody })).toThrow(TypeError);
    expect(() => signKapsoWebhook({ secret, rawBody: {} as unknown as string })).toThrow(TypeError);
  });
});
