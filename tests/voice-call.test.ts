import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  WhatsAppClient,
  TemplateDefinition,
  buildCallDeepLink,
  buildTemplatePayload,
  buildTemplateSendPayload,
  buildVoiceCallTemplateButton
} from "../src";
import type {
  TemplateButtonComponent,
  TemplateButtonVoiceCallComponent,
  TemplateComponent,
  TemplateSendPayload,
  VoiceCallInteractiveInput
} from "../src";
import type { TemplateCarouselCardComponent } from "../src/resources/templates/types";
import { getCallArtifactKind, isCallArtifactEvent, normalizeWebhook } from "../src/server";
import type { NormalizedCallEvent } from "../src/server";

// Payload chosen to exercise percent-encoding and JSON round trips.
const TRACKING = "camp=fall sale&src=qr?x=1#frag ñandú 📞 50%/+";

function setupClient() {
  const requests: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, method: init?.method, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(
      JSON.stringify({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.TEST" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  return { client: new WhatsAppClient({ accessToken: "token", fetch: fetchMock }), requests };
}

describe("messages.sendInteractiveVoiceCall", () => {
  it("serializes Meta's documented voice_call wire shape with phone and BSUID", async () => {
    const { client, requests } = setupClient();

    await client.messages.sendInteractiveVoiceCall({
      phoneNumberId: "123",
      to: "14085551234",
      recipient: "US.13491208655302741918",
      bodyText: "You can call us on WhatsApp now for faster service!",
      parameters: { displayText: "Call on WhatsApp", ttlMinutes: 100, payload: "payload data" }
    });

    expect(requests[0]?.url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(requests[0]?.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "14085551234",
      recipient: "US.13491208655302741918",
      type: "interactive",
      interactive: {
        type: "voice_call",
        body: { text: "You can call us on WhatsApp now for faster service!" },
        action: {
          name: "voice_call",
          parameters: { display_text: "Call on WhatsApp", ttl_minutes: 100, payload: "payload data" }
        }
      }
    });
  });

  it("sends to a BSUID alone and omits parameters when none are given", async () => {
    const { client, requests } = setupClient();

    await client.messages.sendInteractiveVoiceCall({
      phoneNumberId: "123",
      recipient: "US.13491208655302741918",
      bodyText: "Call us"
    });

    expect(requests[0]?.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      recipient: "US.13491208655302741918",
      type: "interactive",
      interactive: { type: "voice_call", body: { text: "Call us" }, action: { name: "voice_call" } }
    });
  });

  it("keeps only the parameters that are set and preserves the tracking payload byte for byte", async () => {
    const { client, requests } = setupClient();

    await client.messages.sendInteractiveVoiceCall({
      phoneNumberId: "123",
      to: "14085551234",
      bodyText: "Call us",
      parameters: { payload: TRACKING }
    });

    expect((requests[0]?.body.interactive as Record<string, unknown>).action).toEqual({
      name: "voice_call",
      parameters: { payload: TRACKING }
    });
  });

  it("accepts the documented boundaries", async () => {
    const { client, requests } = setupClient();
    for (const parameters of [
      { displayText: "x".repeat(20), ttlMinutes: 1, payload: "p".repeat(512) },
      { ttlMinutes: 43200 }
    ]) {
      await client.messages.sendInteractiveVoiceCall({ phoneNumberId: "123", to: "1", bodyText: "Call", parameters });
    }
    expect(requests).toHaveLength(2);
  });

  it.each([
    ["display text over 20 characters", { displayText: "x".repeat(21) }, /parameters\.displayText/],
    ["empty display text", { displayText: "" }, /parameters\.displayText/],
    ["ttl below 1", { ttlMinutes: 0 }, /parameters\.ttlMinutes/],
    ["ttl above 43200", { ttlMinutes: 43201 }, /parameters\.ttlMinutes/],
    ["fractional ttl", { ttlMinutes: 1.5 }, /parameters\.ttlMinutes/],
    ["payload over 512 characters", { payload: "p".repeat(513) }, /parameters\.payload/],
    ["empty payload", { payload: "" }, /parameters\.payload/]
  ])("rejects %s without sending", async (_, parameters, message) => {
    const { client, requests } = setupClient();
    await expect(
      client.messages.sendInteractiveVoiceCall({ phoneNumberId: "123", to: "1", bodyText: "Call", parameters })
    ).rejects.toThrow(message);
    expect(requests).toHaveLength(0);
  });

  it("requires body text and a recipient", async () => {
    const { client, requests } = setupClient();
    await expect(
      client.messages.sendInteractiveVoiceCall({ phoneNumberId: "123", to: "1", bodyText: "" })
    ).rejects.toThrow(/bodyText/);
    await expect(
      client.messages.sendInteractiveVoiceCall({ phoneNumberId: "123", bodyText: "Call" } as unknown as VoiceCallInteractiveInput)
    ).rejects.toThrow(/Provide to/);
    expect(requests).toHaveLength(0);
  });

  it("requires to or recipient at the type level", () => {
    expectTypeOf<{ phoneNumberId: string; bodyText: string }>().not.toMatchTypeOf<VoiceCallInteractiveInput>();
    expectTypeOf<{ phoneNumberId: string; bodyText: string; recipient: string }>().toMatchTypeOf<VoiceCallInteractiveInput>();
  });
});

describe("voice_call template sends", () => {
  it("builds the button component and sends Meta's documented parameter shape", async () => {
    const { client, requests } = setupClient();
    const template = buildTemplateSendPayload({
      name: "wa_voice_call",
      language: "en",
      buttons: [buildVoiceCallTemplateButton({ index: 0, ttlMinutes: 100, payload: TRACKING })]
    });

    await client.messages.sendTemplate({
      phoneNumberId: "123",
      to: "14085551234",
      recipient: "US.13491208655302741918",
      template
    });

    expect(requests[0]?.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "14085551234",
      recipient: "US.13491208655302741918",
      type: "template",
      template: {
        name: "wa_voice_call",
        language: { code: "en" },
        components: [
          {
            type: "button",
            sub_type: "voice_call",
            index: 0,
            parameters: [
              { type: "ttl_minutes", ttl_minutes: 100 },
              { type: "payload", payload: TRACKING }
            ]
          }
        ]
      }
    });
  });

  it("builds a button with no overrides", () => {
    expect(buildVoiceCallTemplateButton({ index: 1 })).toEqual({ type: "button", subType: "voice_call", index: 1 });
  });

  it("uses the send range (1-43200), not the creation range", () => {
    expect(buildVoiceCallTemplateButton({ index: 0, ttlMinutes: 1 }).parameters).toEqual([{ type: "ttl_minutes", ttlMinutes: 1 }]);
    expect(buildVoiceCallTemplateButton({ index: 0, ttlMinutes: 43200 }).parameters).toHaveLength(1);
    expect(() => buildVoiceCallTemplateButton({ index: 0, ttlMinutes: 0 })).toThrow();
    expect(() => buildVoiceCallTemplateButton({ index: 0, ttlMinutes: 43201 })).toThrow();
    expect(() => buildVoiceCallTemplateButton({ index: 0, payload: "p".repeat(513) })).toThrow();
    expect(() => buildVoiceCallTemplateButton({ index: 0, payload: "" })).toThrow();
    expect(buildVoiceCallTemplateButton({ index: 0, payload: "p".repeat(512) }).parameters).toHaveLength(1);
  });

  it("rejects duplicate parameters and voice_call buttons inside carousel cards", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en",
        buttons: [{
          type: "button",
          subType: "voice_call",
          index: 0,
          parameters: [{ type: "payload", payload: "a" }, { type: "payload", payload: "b" }]
        }]
      })
    ).toThrow(/at most once/);

    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en",
        cards: [{ cardIndex: 0, components: [buildVoiceCallTemplateButton({ index: 0 }) as never] }]
      })
    ).toThrow();
  });

  it("normalizes Meta-style raw voice_call buttons and keeps snake_case ttl", () => {
    const template = buildTemplatePayload({
      name: "wa_voice_call",
      language: "en",
      components: [{
        type: "BUTTON",
        sub_type: "VOICE_CALL",
        index: "0",
        parameters: [{ type: "TTL_MINUTES", ttl_minutes: 100 }, { type: "payload", payload: TRACKING }]
      }]
    });

    expect(template.components).toEqual([{
      type: "button",
      subType: "voice_call",
      index: 0,
      parameters: [{ type: "ttl_minutes", ttl_minutes: 100 }, { type: "payload", payload: TRACKING }]
    }]);
  });

  it.each([
    ["missing index", { type: "button", sub_type: "voice_call" }, /index is required/],
    ["ttl above 43200", { type: "button", sub_type: "voice_call", index: 0, parameters: [{ type: "ttl_minutes", ttl_minutes: 43201 }] }, /ttl_minutes must be an integer between 1 and 43200/],
    ["ttl below 1", { type: "button", sub_type: "voice_call", index: 0, parameters: [{ type: "ttl_minutes", ttlMinutes: 0 }] }, /ttl_minutes/],
    ["payload over 512", { type: "button", sub_type: "voice_call", index: 0, parameters: [{ type: "payload", payload: "p".repeat(513) }] }, /payload must be 1-512/],
    ["unknown parameter", { type: "button", sub_type: "voice_call", index: 0, parameters: [{ type: "text", text: "x" }] }, /'ttl_minutes' or 'payload'/],
    ["duplicate parameter", { type: "button", sub_type: "voice_call", index: 0, parameters: [{ type: "payload", payload: "a" }, { type: "payload", payload: "b" }] }, /only once/]
  ])("raw builder rejects %s", (_, component, message) => {
    expect(() => buildTemplatePayload({ name: "tpl", language: "en", components: [component] })).toThrow(message);
  });

  it("raw builder rejects voice_call inside carousel cards", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en",
        components: [{
          type: "carousel",
          cards: [{ card_index: 0, components: [{ type: "button", sub_type: "voice_call", index: 0 }] }]
        }]
      })
    ).toThrow(/not supported inside carousel cards/);
  });

  it("still passes Meta's index-less sample through the raw sendTemplate escape hatch", async () => {
    const { client, requests } = setupClient();
    await client.messages.sendTemplate({
      phoneNumberId: "123",
      to: "14085551234",
      template: {
        name: "wa_voice_call",
        language: { code: "en" },
        components: [{
          type: "button",
          sub_type: "voice_call",
          parameters: [{ type: "ttl_minutes", ttl_minutes: 100 }, { type: "payload", payload: "payload data" }]
        }]
      }
    });

    expect((requests[0]?.body.template as Record<string, unknown>).components).toEqual([{
      type: "button",
      sub_type: "voice_call",
      parameters: [{ type: "ttl_minutes", ttl_minutes: 100 }, { type: "payload", payload: "payload data" }]
    }]);
  });
});

describe("template typing contracts", () => {
  it("keeps button narrowing and required index on every button type", () => {
    const narrow = (component: TemplateComponent): TemplateButtonComponent | undefined =>
      component.type === "button" ? component : undefined;
    expect(narrow(buildVoiceCallTemplateButton({ index: 0 }))?.subType).toBe("voice_call");

    expectTypeOf<TemplateButtonComponent["index"]>().toEqualTypeOf<number | string>();
    expectTypeOf<TemplateButtonVoiceCallComponent>().toMatchTypeOf<TemplateButtonComponent>();
    expectTypeOf<Extract<TemplateCarouselCardComponent, { subType: "voice_call" }>>().toEqualTypeOf<never>();
  });

  it("lets both builders feed sendTemplate without casts", () => {
    const typed: TemplateSendPayload = buildTemplateSendPayload({
      name: "tpl",
      language: "en",
      buttons: [buildVoiceCallTemplateButton({ index: 0 })]
    });
    const raw: TemplateSendPayload = buildTemplatePayload({
      name: "tpl",
      language: "en",
      components: [{ type: "button", sub_type: "voice_call", index: 0 }]
    });
    type SendTemplateInput = Parameters<WhatsAppClient["messages"]["sendTemplate"]>[0];
    expectTypeOf({ phoneNumberId: "1", to: "1", template: typed }).toMatchTypeOf<SendTemplateInput>();
    expectTypeOf({ phoneNumberId: "1", to: "1", template: raw }).toMatchTypeOf<SendTemplateInput>();
  });
});

describe("voice_call template creation", () => {
  const definition = (button: Record<string, unknown>) => ({
    name: "wa_voice_call",
    language: "en",
    category: "MARKETING" as const,
    components: [
      { type: "BODY" as const, text: "You can call us on WhatsApp now for faster service!" },
      {
        type: "BUTTONS" as const,
        buttons: [button, { type: "URL", text: "Contact Support", url: "https://www.luckyshrub.com/support" }]
      }
    ]
  }) as TemplateDefinition.TemplateDefinitionInput;

  it("accepts a voice_call button next to a URL button and creates it with Meta's wire keys", async () => {
    const { client, requests } = setupClient();
    const parsed = TemplateDefinition.buildTemplateDefinition(
      definition({ type: "voice_call", text: "Call Now", ttlMinutes: 1440 })
    );

    await client.templates.create({ businessAccountId: "WABA", ...parsed });

    expect(requests[0]?.url).toBe("https://graph.facebook.com/v23.0/WABA/message_templates");
    expect(requests[0]?.body.components).toEqual([
      { type: "BODY", text: "You can call us on WhatsApp now for faster service!" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "voice_call", text: "Call Now", ttl_minutes: 1440 },
          { type: "URL", text: "Contact Support", url: "https://www.luckyshrub.com/support" }
        ]
      }
    ]);
  });

  it("accepts the uppercase type, optional text and ttl, and the 43200 upper bound", () => {
    expect(() => TemplateDefinition.buildTemplateDefinition(definition({ type: "VOICE_CALL" }))).not.toThrow();
    expect(() => TemplateDefinition.buildTemplateDefinition(definition({ type: "voice_call", ttlMinutes: 43200, text: "x".repeat(20) }))).not.toThrow();
  });

  it.each([
    ["ttl below the 1440 creation minimum", { type: "voice_call", ttlMinutes: 1439 }],
    ["ttl above 43200", { type: "voice_call", ttlMinutes: 43201 }],
    ["text over 20 characters", { type: "voice_call", text: "x".repeat(21) }]
  ])("rejects %s", (_, button) => {
    expect(() => TemplateDefinition.buildTemplateDefinition(definition(button))).toThrow();
  });
});

describe("buildCallDeepLink", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds a wa.me/call link from a formatted business number", () => {
    expect(buildCallDeepLink({ phoneNumber: "+1 (408) 555-1234" })).toBe("https://wa.me/call/14085551234");
    expect(buildCallDeepLink({ phoneNumber: "14085551234" })).toBe("https://wa.me/call/14085551234");
  });

  it("percent-encodes the biz_payload so spaces, Unicode, & ? # survive", () => {
    const link = buildCallDeepLink({ phoneNumber: "14085551234", payload: TRACKING });

    expect(link.startsWith("https://wa.me/call/14085551234?biz_payload=")).toBe(true);
    expect(link).not.toMatch(/[ &#ñ📞]|\?.*\?/u);
    const url = new URL(link);
    expect([...url.searchParams.keys()]).toEqual(["biz_payload"]);
    expect(url.searchParams.get("biz_payload")).toBe(TRACKING);
    expect(url.hash).toBe("");
  });

  it("encodes spaces as %20 rather than +", () => {
    expect(buildCallDeepLink({ phoneNumber: "14085551234", payload: "a b+c" })).toBe(
      "https://wa.me/call/14085551234?biz_payload=a%20b%2Bc"
    );
  });

  it("does not make network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    buildCallDeepLink({ phoneNumber: "14085551234", payload: "x" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["", "+", "abc", "0123456789", "123456", "1234567890123456", "1408555123x"])("rejects phone number %j", (phoneNumber) => {
    expect(() => buildCallDeepLink({ phoneNumber })).toThrow(/phoneNumber/);
  });

  it("rejects an empty payload", () => {
    expect(() => buildCallDeepLink({ phoneNumber: "14085551234", payload: "" })).toThrow(/payload/);
  });
});

describe("call tracking payloads in normalized webhooks", () => {
  const webhook = (calls: unknown[]) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "calls", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, calls } }] }]
  });

  it("surfaces cta_payload and deeplink_payload on connect and terminate without touching ids", () => {
    const calls = normalizeWebhook(webhook([
      {
        id: "wacid.ABC",
        event: "connect",
        direction: "USER_INITIATED",
        from: "16315553602",
        from_user_id: "US.1",
        to: "16315553601",
        cta_payload: TRACKING,
        deeplink_payload: "qr:lobby",
        session: { sdp_type: "offer", sdp: "v=0" }
      },
      {
        id: "wacid.ABC",
        event: "terminate",
        direction: "USER_INITIATED",
        from_user_id: "US.1",
        status: "COMPLETED",
        cta_payload: TRACKING,
        deeplink_payload: "qr:lobby"
      }
    ])).calls;

    expect(calls.map((call) => [call.event, call.callId, call.id, call.ctaPayload, call.deeplinkPayload])).toEqual([
      ["connect", "wacid.ABC", "wacid.ABC", TRACKING, "qr:lobby"],
      ["terminate", "wacid.ABC", "wacid.ABC", TRACKING, "qr:lobby"]
    ]);
    expect(calls.every((call) => call.fromUserId === "US.1" && call.wacid === undefined)).toBe(true);
    expect(calls.map(isCallArtifactEvent)).toEqual([false, false]);
    expect(calls.map(getCallArtifactKind)).toEqual([undefined, undefined]);
    expect(calls[1]?.from).toBeUndefined();
  });

  it("leaves the fields absent when Meta omits them", () => {
    const [call] = normalizeWebhook(webhook([{ id: "wacid.X", wacid: "legacy", event: "connect" }])).calls;
    expect(call).not.toHaveProperty("ctaPayload");
    expect(call).not.toHaveProperty("deeplinkPayload");
    expect(call?.callId).toBe("legacy");
  });

  it("types both fields as optional strings", () => {
    expectTypeOf<NormalizedCallEvent["ctaPayload"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NormalizedCallEvent["deeplinkPayload"]>().toEqualTypeOf<string | undefined>();
  });
});
