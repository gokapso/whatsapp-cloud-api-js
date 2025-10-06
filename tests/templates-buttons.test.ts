import { describe, expect, it } from "vitest";
import { buildTemplateDefinition } from "../src/resources/templates/definition";

const base = {
  name: "buttons_demo",
  language: "en_US",
  category: "UTILITY" as const
};

describe("Template buttons validation", () => {
  it("requires URL example when URL contains a variable", () => {
    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          {
            type: "BUTTONS",
            buttons: [
              { type: "URL", text: "Shop", url: "https://x.test?promo={{1}}" }
            ]
          }
        ]
      })
    ).toThrow(/example/i);
  });

  it("accepts phone and url and groups quick replies properly", () => {
    const result = buildTemplateDefinition({
      ...base,
      components: [
        { type: "BODY", text: "Body" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "URL", text: "Open", url: "https://x.test" },
            { type: "PHONE_NUMBER", text: "Call", phoneNumber: "15550000000" },
            { type: "QUICK_REPLY", text: "Stop" },
            { type: "QUICK_REPLY", text: "Pause" }
          ]
        }
      ]
    });
    expect(result).toBeTruthy();
  });

  it("rejects interleaved quick replies and non-quick buttons", () => {
    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          {
            type: "BUTTONS",
            buttons: [
              { type: "QUICK_REPLY", text: "A" },
              { type: "URL", text: "Open", url: "https://x.test" },
              { type: "QUICK_REPLY", text: "B" }
            ]
          }
        ]
      })
    ).toThrow(/group/i);
  });

  it("enforces copy code example length", () => {
    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          { type: "BUTTONS", buttons: [{ type: "COPY_CODE", example: "A".repeat(16) }] }
        ]
      })
    ).toThrow();
  });

  it("flow button requires exactly one of id/name/json", () => {
    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Start" }] }
        ]
      })
    ).toThrow(/flow/i);

    const ok = buildTemplateDefinition({
      ...base,
      components: [
        { type: "BODY", text: "Body" },
        { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Start", flowId: "123" }] }
      ]
    });
    expect(ok).toBeTruthy();
  });

  it("limits buttons: max 10 total, max 2 url, max 1 phone", () => {
    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          {
            type: "BUTTONS",
            buttons: Array.from({ length: 11 }, (_, i) => ({ type: "QUICK_REPLY", text: `Q${i}` }))
          }
        ]
      })
    ).toThrow(/10/i);

    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          {
            type: "BUTTONS",
            buttons: [
              { type: "URL", text: "Open1", url: "https://x1.test" },
              { type: "URL", text: "Open2", url: "https://x2.test" },
              { type: "URL", text: "Open3", url: "https://x3.test" }
            ]
          }
        ]
      })
    ).toThrow(/url/i);

    expect(() =>
      buildTemplateDefinition({
        ...base,
        components: [
          { type: "BODY", text: "Body" },
          {
            type: "BUTTONS",
            buttons: [
              { type: "PHONE_NUMBER", text: "Call", phoneNumber: "1" },
              { type: "PHONE_NUMBER", text: "Call2", phoneNumber: "2" }
            ]
          }
        ]
      })
    ).toThrow(/phone/i);
  });
});
