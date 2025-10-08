import { describe, expect, it } from "vitest";
import { buildTemplateSendPayload } from "../src/resources/templates/send";

describe("Template send payload builder", () => {
  it("throws when name is missing", () => {
    expect(() =>
      buildTemplateSendPayload({
        language: "en_US",
        body: [{ type: "text", text: "Hi" }]
      } as any)
    ).toThrowError(/name/i);
  });

  it("throws when language is missing", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        body: [{ type: "text", text: "Hi" }]
      } as any)
    ).toThrowError(/language/i);
  });

  it("rejects non-string language values", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: { code: "en_US" }
      } as any)
    ).toThrowError(/expected string/i);
  });

  it("throws when raw components are provided", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        components: []
      } as any)
    ).toThrowError(/does not accept raw components/i);
  });

  it("builds text-based template with positional body parameters", () => {
    const tpl = buildTemplateSendPayload({
      name: "order_confirm",
      language: "en_US",
      body: [
        { type: "text", text: "John" },
        { type: "text", text: "9128312831" }
      ]
    });

    expect(tpl).toMatchObject({
      name: "order_confirm",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "John" },
            { type: "text", text: "9128312831" }
          ]
        }
      ]
    });
  });

  it("builds header image parameter via link", () => {
    const tpl = buildTemplateSendPayload({
      name: "promo_image",
      language: "en_US",
      header: { type: "image", image: { link: "https://example.com/img.jpg" } },
      body: [{ type: "text", text: "John" }]
    });
    expect(tpl.components[0]).toMatchObject({
      type: "header",
      parameters: [
        { type: "image", image: { link: "https://example.com/img.jpg" } }
      ]
    });
  });

  it("builds header media by id", () => {
    const tpl = buildTemplateSendPayload({
      name: "promo_image",
      language: "en_US",
      header: { type: "image", image: { id: "MEDIA123" } }
    });

    expect(tpl.components[0]).toMatchObject({
      parameters: [{ type: "image", image: { id: "MEDIA123" } }]
    });
  });

  it("builds location header parameter", () => {
    const tpl = buildTemplateSendPayload({
      name: "delivery_loc",
      language: "en_US",
      header: { type: "location", location: { latitude: 10.2, longitude: 20.3, name: "HQ", address: "123 Main" } }
    });
    expect(tpl.components[0]).toMatchObject({
      type: "header",
      parameters: [
        { type: "location", location: { latitude: 10.2, longitude: 20.3 } }
      ]
    });
  });

  it("rejects header media without id or link", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        header: { type: "video", video: {} as any }
      })
    ).toThrowError(/video requires id or link/i);
  });

  it("keeps component ordering header, body, buttons", () => {
    const tpl = buildTemplateSendPayload({
      name: "tpl",
      language: "en_US",
      header: { type: "text", text: "Header" },
      body: [{ type: "text", text: "Body" }],
      buttons: [
        { type: "button", subType: "url", index: 0, parameters: [{ type: "text", text: "btn" }] }
      ]
    });

    expect(tpl.components.map((c) => c.type)).toEqual(["header", "body", "button"]);
  });

  it("does not mutate provided input", () => {
    const input = {
      name: "tpl",
      language: "en_US",
      body: [{ type: "text", text: "Hi" }],
      buttons: [
        { type: "button", subType: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "ACK" }] }
      ]
    } as const;
    const snapshot = JSON.parse(JSON.stringify(input));

    buildTemplateSendPayload({ ...input, buttons: [...input.buttons] });

    expect(input).toEqual(snapshot);
  });

  it("adds quick reply button parameters", () => {
    const tpl = buildTemplateSendPayload({
      name: "with_buttons",
      language: "en_US",
      buttons: [
        { type: "button", subType: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "STOP" }] }
      ]
    });
    expect(tpl.components[0]).toMatchObject({
      type: "button",
      subType: "quick_reply",
      index: 0
    });
  });

  it("adds url button variable parameter", () => {
    const tpl = buildTemplateSendPayload({
      name: "with_url_btn",
      language: "en_US",
      buttons: [
        { type: "button", subType: "url", index: 1, parameters: [{ type: "text", text: "promo2025" }] }
      ]
    });
    expect(tpl.components[0]).toMatchObject({
      type: "button",
      subType: "url",
      index: 1
    });
  });

  it("adds phone number, flow (action), and copy code buttons", () => {
    const tpl = buildTemplateSendPayload({
      name: "buttons",
      language: "en_US",
      buttons: [
        { type: "button", subType: "phone_number", index: 0 },
        { type: "button", subType: "copy_code", index: 1, parameters: [{ type: "text", text: "12345" }] },
        {
          type: "button",
          subType: "flow",
          index: 2,
          parameters: [{ type: "action", action: { flow_token: "FT", flow_action_data: { step: "one" } } }]
        }
      ]
    });

    expect(tpl.components).toHaveLength(3);
    expect(tpl.components[0]).toMatchObject({ subType: "phone_number" });
    expect(tpl.components[1]).toMatchObject({ subType: "copy_code" });
    expect(tpl.components[2]).toMatchObject({
      subType: "flow",
      parameters: [
        {
          type: "action",
          action: { flow_token: "FT", flow_action_data: { step: "one" } }
        }
      ]
    });
  });

  it("allows flow buttons without parameters", () => {
    const tpl = buildTemplateSendPayload({
      name: "flow_optional",
      language: "en_US",
      buttons: [{ type: "button", subType: "flow", index: 0 }]
    });

    expect(tpl.components[0]).not.toHaveProperty("parameters");
  });

  it("accepts body currency and date parameters", () => {
    const tpl = buildTemplateSendPayload({
      name: "tpl",
      language: "en_US",
      body: [
        {
          type: "currency",
          currency: { fallbackValue: "$10", code: "USD", amount1000: 10000 }
        },
        {
          type: "date_time",
          dateTime: { fallbackValue: "Tomorrow" }
        }
      ]
    });

    expect(tpl.components[0].parameters).toHaveLength(2);
  });

  it("throws when currency amount is not an integer", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        body: [
          {
            type: "currency",
            currency: { fallbackValue: "$10", code: "USD", amount1000: 10.5 }
          }
        ]
      })
    ).toThrowError(/expected int/);
  });

  it("throws when body parameter type is unsupported", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        body: [{ type: "foo", text: "nope" }]
      } as any)
    ).toThrowError(/No matching discriminator/);
  });

  it("throws when button definition is missing subtype or index", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        buttons: [{ type: "button", index: 0 }]
      } as any)
    ).toThrowError(/subType/);

    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        buttons: [{ type: "button", subType: "url" }]
      } as any)
    ).toThrowError(/index/);
  });

  it("throws when copy code button exceeds maximum length", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        buttons: [
          {
            type: "button",
            subType: "copy_code",
            index: 0,
            parameters: [{ type: "text", text: "CODE_TOO_LONG_FOR_META" }]
          }
        ]
      })
    ).toThrowError(/<=15 characters/);
  });

  it("throws when flow button parameters contain invalid type", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        buttons: [
          {
            type: "button",
            subType: "flow",
            index: 0,
            parameters: [{ type: "text", text: "bad" }]
          }
        ]
      })
    ).toThrowError(/payload/);
  });

  it("throws when url button parameter is empty text", () => {
    expect(() =>
      buildTemplateSendPayload({
        name: "tpl",
        language: "en_US",
        buttons: [
          { type: "button", subType: "url", index: 1, parameters: [{ type: "text", text: "" }] }
        ]
      })
    ).toThrowError(/>=1 characters/);
  });
});
