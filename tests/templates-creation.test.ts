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

  it("builds authentication template with otp button and ttl", () => {
    const template = buildTemplateDefinition({
      name: "authentication_code",
      language: "en_US",
      category: "AUTHENTICATION",
      messageSendTtlSeconds: 120,
      components: [
        {
          type: "BODY",
          addSecurityRecommendation: true
        },
        {
          type: "FOOTER",
          codeExpirationMinutes: 5
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "OTP",
              otpType: "COPY_CODE",
              text: "Copy Code",
              supportedApps: [
                {
                  packageName: "com.example.luckyshrub",
                  signatureHash: "K8a/AINcGX7"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(template.messageSendTtlSeconds).toBe(120);
    expect(template.components[0]).toMatchObject({ addSecurityRecommendation: true });
    expect(template.components[1]).toMatchObject({ codeExpirationMinutes: 5 });
    expect(template.components[2].buttons[0]).toMatchObject({ type: "OTP", otpType: "COPY_CODE" });
  });

  it("accepts limited time offer component", () => {
    const template = buildTemplateDefinition({
      name: "limited_offer",
      language: "en_US",
      category: "MARKETING",
      components: [
        {
          type: "BODY",
          text: "Hi there"
        },
        {
          type: "LIMITED_TIME_OFFER",
          limitedTimeOffer: {
            text: "Ends soon!",
            hasExpiration: true
          }
        }
      ]
    });

    expect(template.components[1]).toMatchObject({ limitedTimeOffer: { text: "Ends soon!", hasExpiration: true } });
  });

  it("supports catalog button type", () => {
    const template = buildTemplateDefinition({
      name: "catalog_push",
      language: "en_US",
      category: "MARKETING",
      components: [
        { type: "BODY", text: "Check out our catalog" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "CATALOG", text: "View catalog" }
          ]
        }
      ]
    });

    expect(template.components[1].buttons[0]).toMatchObject({ type: "CATALOG", text: "View catalog" });
  });

  it("supports call permission request component", () => {
    const template = buildTemplateDefinition({
      name: "call_permission_followup",
      language: "en",
      category: "UTILITY",
      components: [
        { type: "BODY", text: "We would like to call you" },
        { type: "CALL_PERMISSION_REQUEST" }
      ]
    });

    expect(template.components[1]).toMatchObject({ type: "CALL_PERMISSION_REQUEST" });
  });

  it("supports media carousel components", () => {
    const template = buildTemplateDefinition({
      name: "carousel_media",
      language: "en_US",
      category: "MARKETING",
      components: [
        {
          type: "BODY",
          text: "Rare succulents for sale! {{1}}",
          example: {
            bodyText: [["Pablo"]]
          }
        },
        {
          type: "CAROUSEL",
          cards: [
            {
              components: [
                {
                  type: "HEADER",
                  format: "IMAGE",
                  example: {
                    headerHandle: ["4::imagehandle"]
                  }
                },
                {
                  type: "BUTTONS",
                  buttons: [
                    { type: "QUICK_REPLY", text: "Send more like this" },
                    {
                      type: "URL",
                      text: "Shop",
                      url: "https://example.com/{{1}}",
                      example: ["succulent"]
                    }
                  ]
                }
              ]
            },
            {
              components: [
                {
                  type: "HEADER",
                  format: "IMAGE",
                  example: {
                    headerHandle: ["4::imagehandle2"]
                  }
                },
                {
                  type: "BUTTONS",
                  buttons: [
                    { type: "QUICK_REPLY", text: "Show similar" },
                    {
                      type: "URL",
                      text: "Shop",
                      url: "https://example.com/{{1}}",
                      example: ["cactus"]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(template.components[1]).toHaveProperty("cards");
    expect(template.components[1].cards).toHaveLength(2);
  });

  it("supports product carousel with spm buttons", () => {
    const template = buildTemplateDefinition({
      name: "carousel_product",
      language: "en_US",
      category: "MARKETING",
      components: [
        {
          type: "BODY",
          text: "Featured products for {{1}}",
          example: {
            bodyText: [["Pablo"]]
          }
        },
        {
          type: "CAROUSEL",
          cards: [
            {
              components: [
                { type: "HEADER", format: "PRODUCT" },
                {
                  type: "BUTTONS",
                  buttons: [{ type: "SPM", text: "View" }]
                }
              ]
            },
            {
              components: [
                { type: "HEADER", format: "PRODUCT" },
                {
                  type: "BUTTONS",
                  buttons: [{ type: "SPM", text: "View" }]
                }
              ]
            }
          ]
        }
      ]
    });

    expect(template.components[1].cards[0].components[1].buttons[0]).toMatchObject({ type: "SPM", text: "View" });
  });

  it("supports multi-product button", () => {
    const template = buildTemplateDefinition({
      name: "mpm_followup",
      language: "en_US",
      category: "MARKETING",
      components: [
        { type: "BODY", text: "Items waiting in your cart" },
        {
          type: "BUTTONS",
          buttons: [{ type: "MPM", text: "View items" }]
        }
      ]
    });

    expect(template.components[1].buttons[0]).toMatchObject({ type: "MPM", text: "View items" });
  });

  it("honors parameter format field", () => {
    const template = buildTemplateDefinition({
      name: "named_parameters",
      language: "en_US",
      category: "UTILITY",
      parameterFormat: "NAMED",
      components: [
        {
          type: "BODY",
          text: "Hello {{first_name}}",
          example: {
            bodyTextNamedParams: [
              { paramName: "first_name", example: "Pablo" }
            ]
          }
        }
      ]
    });

    expect(template.parameterFormat).toBe("NAMED");
    expect(() =>
      buildTemplateDefinition({
        name: "bad_param_format",
        language: "en_US",
        category: "UTILITY",
        parameterFormat: "INVALID" as any,
        components: [
          { type: "BODY", text: "Hi" }
        ]
      })
    ).toThrow(/parameterFormat/);
  });
});
