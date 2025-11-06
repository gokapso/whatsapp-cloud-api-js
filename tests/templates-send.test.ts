import { describe, expect, it, expectTypeOf } from "vitest";
import { buildTemplateSendPayload } from "../src/resources/templates/send";
import type { TemplateMessageInput } from "../src/resources/messages/template";
import type { TemplateSendInput } from "../src/resources/templates/send";
import type { TemplateComponent } from "../src/resources/templates/types";

const unsafe = (input: unknown): TemplateSendInput => input as TemplateSendInput;

function expectComponents(payload: ReturnType<typeof buildTemplateSendPayload>): TemplateComponent[] {
  expect(payload.components).toBeDefined();
  return payload.components ?? [];
}

describe("Template send payload builder", () => {
  it("throws when name is missing", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        language: "en_US",
        body: [{ type: "text", text: "Hi" }]
      }))
    ).toThrowError(/name/i);
  });

  it("throws when language is missing", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        body: [{ type: "text", text: "Hi" }]
      }))
    ).toThrowError(/language/i);
  });

  it("rejects non-string language values", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: { code: "en_US" }
      }))
    ).toThrowError(/expected string/i);
  });

  it("throws when raw components are provided", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: "en_US",
        components: []
      }))
    ).toThrowError(/does not accept raw components/i);
  });

  it("builds text-based template with positional body parameters", () => {
    const template = buildTemplateSendPayload({
      name: "order_confirm",
      language: "en_US",
      body: [
        { type: "text", text: "John" },
        { type: "text", text: "9128312831" }
      ]
    });

    const components = expectComponents(template);
    expect(template).toMatchObject({ name: "order_confirm", language: { code: "en_US" } });
    expect(components[0]).toMatchObject({
      type: "body",
      parameters: [
        { type: "text", text: "John" },
        { type: "text", text: "9128312831" }
      ]
    });
  });

  it("builds header image parameter via link", () => {
    const template = buildTemplateSendPayload({
      name: "promo_image",
      language: "en_US",
      header: { type: "image", image: { link: "https://example.com/img.jpg" } },
      body: [{ type: "text", text: "John" }]
    });
    const components = expectComponents(template);
    expect(components[0]).toMatchObject({
      type: "header",
      parameters: [
        { type: "image", image: { link: "https://example.com/img.jpg" } }
      ]
    });
  });

  it("builds header media by id", () => {
    const template = buildTemplateSendPayload({
      name: "promo_image",
      language: "en_US",
      header: { type: "image", image: { id: "MEDIA123" } }
    });

    const components = expectComponents(template);
    expect(components[0]).toMatchObject({
      parameters: [{ type: "image", image: { id: "MEDIA123" } }]
    });
  });

  it("builds location header parameter", () => {
    const template = buildTemplateSendPayload({
      name: "delivery_loc",
      language: "en_US",
      header: { type: "location", location: { latitude: 10.2, longitude: 20.3, name: "HQ", address: "123 Main" } }
    });
    const components = expectComponents(template);
    expect(components[0]).toMatchObject({
      type: "header",
      parameters: [
        { type: "location", location: { latitude: 10.2, longitude: 20.3 } }
      ]
    });
  });

  it("rejects header media without id or link", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: "en_US",
        header: { type: "video", video: {} }
      }))
    ).toThrowError(/video requires id or link/i);
  });

  it("keeps component ordering header, body, buttons", () => {
    const template = buildTemplateSendPayload({
      name: "tpl",
      language: "en_US",
      header: { type: "text", text: "Header" },
      body: [{ type: "text", text: "Body" }],
      buttons: [
        { type: "button", subType: "url", index: 0, parameters: [{ type: "text", text: "btn" }] }
      ]
    });

    const components = expectComponents(template);
    expect(components.map((c) => c.type)).toEqual(["header", "body", "button"]);
  });

  it("does not mutate provided input", () => {
    const input: TemplateSendInput = {
      name: "tpl",
      language: "en_US",
      body: [{ type: "text", text: "Hi" }],
      buttons: [
        { type: "button", subType: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "ACK" }] }
      ]
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    buildTemplateSendPayload({ ...input, buttons: [...(input.buttons ?? [])] });

    expect(input).toEqual(snapshot);
  });

  it("adds quick reply button parameters", () => {
    const template = buildTemplateSendPayload({
      name: "with_buttons",
      language: "en_US",
      buttons: [
        { type: "button", subType: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "STOP" }] }
      ]
    });
    const components = expectComponents(template);
    expect(components[0]).toMatchObject({
      type: "button",
      subType: "quick_reply",
      index: 0
    });
  });

  it("adds url button variable parameter", () => {
    const template = buildTemplateSendPayload({
      name: "with_url_btn",
      language: "en_US",
      buttons: [
        { type: "button", subType: "url", index: 1, parameters: [{ type: "text", text: "promo2025" }] }
      ]
    });
    const components = expectComponents(template);
    expect(components[0]).toMatchObject({
      type: "button",
      subType: "url",
      index: 1
    });
  });

  it("adds phone number, flow (action), and copy code buttons", () => {
    const template = buildTemplateSendPayload({
      name: "buttons",
      language: "en_US",
      buttons: [
        { type: "button", subType: "phone_number", index: 0 },
        {
          type: "button",
          subType: "copy_code",
          index: 1,
          parameters: [{ type: "coupon_code", coupon_code: "12345" }]
        },
        {
          type: "button",
          subType: "flow",
          index: 2,
          parameters: [{ type: "action", action: { flow_token: "FT", flow_action_data: { step: "one" } } }]
        }
      ]
    });

    const components = expectComponents(template);
    expect(components).toHaveLength(3);
    expect(components[0]).toMatchObject({ subType: "phone_number" });
    expect(components[1]).toMatchObject({ subType: "copy_code" });
    expect(components[1]).toMatchObject({
      parameters: [
        {
          type: "coupon_code",
          coupon_code: "12345"
        }
      ]
    });
    expect(components[2]).toMatchObject({
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
    const template = buildTemplateSendPayload({
      name: "flow_optional",
      language: "en_US",
      buttons: [{ type: "button", subType: "flow", index: 0 }]
    });

    const components = expectComponents(template);
    expect(components[0]).not.toHaveProperty("parameters");
  });

  it("accepts body currency and date parameters", () => {
    const template = buildTemplateSendPayload({
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

    const components = expectComponents(template);
    expect(components[0].parameters).toHaveLength(2);
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
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: "en_US",
        body: [{ type: "foo", text: "nope" }]
      }))
    ).toThrowError(/No matching discriminator/);
  });

  it("throws when button definition is missing subtype or index", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: "en_US",
        buttons: [{ type: "button", index: 0 }]
      }))
    ).toThrowError(/subType/);

    expect(() =>
      buildTemplateSendPayload(unsafe({
        name: "tpl",
        language: "en_US",
        buttons: [{ type: "button", subType: "url" }]
      }))
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
            parameters: [{ type: "coupon_code", coupon_code: "CODE_TOO_LONG_FOR_META" }]
          }
        ]
      })
    ).toThrowError(/<=15 characters/i);
  });

  it("throws when flow button parameters contain invalid type", () => {
    expect(() =>
      buildTemplateSendPayload(unsafe({
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
      }))
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

  it("preserves parameterName fields for named parameters", () => {
    const template = buildTemplateSendPayload({
      name: "named",
      language: "en_US",
      header: { type: "text", text: "Hi", parameterName: "header_name" },
      body: [
        { type: "text", text: "Customer", parameterName: "customer" },
        {
          type: "currency",
          currency: { fallbackValue: "$10", code: "USD", amount1000: 10000 },
          parameterName: "amount"
        },
        { type: "date_time", dateTime: { fallbackValue: "Tomorrow" }, parameterName: "appointment" }
      ],
      buttons: [
        {
          type: "button",
          subType: "url",
          index: 0,
          parameters: [{ type: "text", text: "CODE", parameterName: "code" }]
        },
        {
          type: "button",
          subType: "quick_reply",
          index: 1,
          parameters: [{ type: "payload", payload: "ACK", parameterName: "reply" }]
        }
      ]
    });

    const components = expectComponents(template);
    const header = components.find((component) => component.type === "header");
    expect(header).toBeDefined();
    if (!header || header.type !== "header") {
      throw new Error("Expected header component");
    }
    expect(header.parameters).toEqual([expect.objectContaining({ parameterName: "header_name" })]);

    const body = components.find((component) => component.type === "body");
    expect(body).toBeDefined();
    if (!body || body.type !== "body") {
      throw new Error("Expected body component");
    }
    expect(body.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parameterName: "customer" }),
        expect.objectContaining({ parameterName: "amount" }),
        expect.objectContaining({ parameterName: "appointment" })
      ])
    );

    const urlButton = components.find(
      (component) => component.type === "button" && (component as any).subType === "url"
    );
    expect(urlButton).toBeDefined();
    if (!urlButton || urlButton.type !== "button") {
      throw new Error("Expected url button component");
    }
    expect(urlButton.parameters).toEqual([expect.objectContaining({ parameterName: "code" })]);

    const quickReplyButton = components.find(
      (component) => component.type === "button" && (component as any).subType === "quick_reply"
    );
    expect(quickReplyButton).toBeDefined();
    if (!quickReplyButton || quickReplyButton.type !== "button") {
      throw new Error("Expected quick reply button component");
    }
    expect(quickReplyButton.parameters).toEqual([expect.objectContaining({ parameterName: "reply" })]);
  });

});
