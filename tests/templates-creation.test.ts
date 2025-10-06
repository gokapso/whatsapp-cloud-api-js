import { describe, expect, it } from "vitest";
import { buildTemplateDefinition } from "../src/resources/templates/definition";

describe("Template definition validation", () => {
  it("accepts a text-only body template", () => {
    const result = buildTemplateDefinition({
      name: "order_update",
      language: "en_US",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: "Your order is on the way!"
        }
      ]
    });

    expect(result).toMatchObject({
      name: "order_update",
      components: [
        {
          type: "BODY",
          text: "Your order is on the way!"
        }
      ]
    });
  });

  it("requires header text examples when placeholders exist", () => {
    expect(() =>
      buildTemplateDefinition({
        name: "promo_header",
        language: "en_US",
        category: "MARKETING",
        components: [
          {
            type: "HEADER",
            format: "TEXT",
            text: "Sale starts {{1}}!"
          },
          {
            type: "BODY",
            text: "Enjoy our sale"
          }
        ]
      })
    ).toThrow(/headerText/i);
  });

  it("accepts header text with positional example", () => {
    const result = buildTemplateDefinition({
      name: "promo_header",
      language: "en_US",
      category: "MARKETING",
      components: [
        {
          type: "HEADER",
          format: "TEXT",
          text: "Sale starts {{1}}!",
          example: {
            headerText: ["December 1"]
          }
        },
        {
          type: "BODY",
          text: "Enjoy our sale"
        }
      ]
    });

    expect(result.components[0]).toMatchObject({
      example: { headerText: ["December 1"] }
    });
  });

  it("rejects body over 1024 characters", () => {
    expect(() =>
      buildTemplateDefinition({
        name: "long_body",
        language: "en_US",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "a".repeat(1025)
          }
        ]
      })
    ).toThrow();
  });

  it("rejects templates missing body component", () => {
    expect(() =>
      buildTemplateDefinition({
        name: "missing_body",
        language: "en_US",
        category: "UTILITY",
        components: [
          {
            type: "HEADER",
            format: "TEXT",
            text: "Hi",
            example: { headerText: ["Hi"] }
        }
      ]
    })
    ).toThrow(/body component/i);
  });
});
