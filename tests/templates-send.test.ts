import { describe, expect, it } from "vitest";
import { buildTemplateSendPayload } from "../src/resources/templates/send";

describe("Template send payload builder", () => {
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

  it("adds quick reply button parameters", () => {
    const tpl = buildTemplateSendPayload({
      name: "with_buttons",
      language: "en_US",
      buttons: [
        { type: "button", sub_type: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "STOP" }] }
      ]
    });
    expect(tpl.components[0]).toMatchObject({
      type: "button",
      sub_type: "quick_reply",
      index: 0
    });
  });

  it("adds url button variable parameter", () => {
    const tpl = buildTemplateSendPayload({
      name: "with_url_btn",
      language: "en_US",
      buttons: [
        { type: "button", sub_type: "url", index: 1, parameters: [{ type: "text", text: "promo2025" }] }
      ]
    });
    expect(tpl.components[0]).toMatchObject({
      type: "button",
      sub_type: "url",
      index: 1
    });
  });
});

