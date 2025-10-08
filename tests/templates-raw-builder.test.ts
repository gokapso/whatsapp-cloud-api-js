import { describe, expect, it } from "vitest";
import { buildTemplatePayload } from "../src/resources/templates/raw";

describe("buildTemplatePayload", () => {
  it("throws when name is missing", () => {
    expect(() =>
      buildTemplatePayload({
        language: "en_US",
        components: [
          { type: "body", parameters: [{ type: "text", text: "Hi" }] }
        ]
      } as any)
    ).toThrowError(/name/i);
  });

  it("throws when language is missing", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        components: [
          { type: "body", parameters: [{ type: "text", text: "Hi" }] }
        ]
      } as any)
    ).toThrowError(/language/i);
  });

  it("rejects language objects with extra keys", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: { code: "en_US", region: "US" } as any,
        components: [
          { type: "body", parameters: [{ type: "text", text: "Hi" }] }
        ]
      })
    ).toThrowError(/Unrecognized key/);
  });

  it("requires language.policy when language is an object", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: { code: "en_US" } as any,
        components: [
          { type: "body", parameters: [{ type: "text", text: "Hi" }] }
        ]
      })
    ).toThrowError(/policy/);
  });

  it("accepts language object with policy=deterministic", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: { code: "en_US", policy: "deterministic" },
      components: [
        { type: "body", parameters: [{ type: "text", text: "Hi" }] }
      ]
    });
    expect(payload.language).toEqual({ code: "en_US", policy: "deterministic" });
  });

  it("builds payload from raw body component", () => {
    const payload = buildTemplatePayload({
      name: "welcome_to_kapso_v2",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "matte.andres@gmail.com" }
          ]
        }
      ]
    });

    expect(payload).toEqual({
      name: "welcome_to_kapso_v2",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "matte.andres@gmail.com" }
          ]
        }
      ]
    });
  });

  it("normalizes component type casing", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "HEADER",
          parameters: [{ type: "TEXT", text: "Hello" }]
        }
      ]
    });

    expect(payload.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "text", text: "Hello" }]
    });
  });

  it("preserves component order", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        { type: "header", parameters: [{ type: "text", text: "Header" }] },
        { type: "body", parameters: [{ type: "text", text: "Body" }] },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: "btn" }]
        }
      ]
    });

    expect(payload.components.map((c) => c.type)).toEqual(["header", "body", "button"]);
  });

  it("does not mutate the input payload", () => {
    const input = {
      name: "tpl",
      language: "en_US",
      components: [
        { type: "body", parameters: [{ type: "text", text: "Hi" }] },
        {
          type: "button",
          sub_type: "quick_reply",
          index: 0,
          parameters: [{ type: "payload", payload: "ACK" }]
        }
      ]
    } as const;
    const snapshot = JSON.parse(JSON.stringify(input));

    buildTemplatePayload(input);

    expect(input).toEqual(snapshot);
  });

  it("throws when header media parameter lacks id and link", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "HEADER",
            parameters: [{ type: "IMAGE" }]
          }
        ]
      })
    ).toThrowError(/image must be an object containing id or link/i);
  });

  it("throws when body parameter text is missing", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [{ type: "text" }]
          }
        ]
      })
    ).toThrowError(/text must be a string/i);
  });

  it("throws when body parameter type is unsupported", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [{ type: "foo" }]
          }
        ]
      })
    ).toThrowError(/components\[0\]\.parameters\[0\].type 'foo' is not supported/i);
  });

  it("throws when body parameter item is not an object", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [null as any]
          }
        ]
      })
    ).toThrowError(/components\[0\]\.parameters\[0\].type is required/);
  });

  it("throws when body currency parameter is malformed", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "currency",
                currency: { code: "USD", amount1000: 1000 }
              }
            ]
          }
        ]
      })
    ).toThrowError(/currency\.fallback_value/i);
  });

  it("preserves named body parameters", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "customer_name", text: "Pablo" }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "text",
      parameter_name: "customer_name",
      text: "Pablo"
    });
  });

  it("accepts body currency with snake_case keys", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "currency",
              currency: {
                fallback_value: "$10.00",
                code: "USD",
                amount_1000: 10000
              }
            }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "currency",
      currency: {
        fallback_value: "$10.00",
        code: "USD",
        amount_1000: 10000
      }
    });
  });

  it("accepts body currency with camelCase keys", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "currency",
              currency: {
                fallbackValue: "$15.00",
                code: "USD",
                amount1000: 15000
              }
            }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "currency",
      currency: {
        fallbackValue: "$15.00",
        code: "USD",
        amount1000: 15000
      }
    });
  });

  it("accepts body date_time with camelCase keys", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "date_time",
              dateTime: { fallbackValue: "January 1" }
            }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "date_time",
      dateTime: { fallbackValue: "January 1" }
    });
  });

  it("accepts body date_time with snake_case keys", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "date_time",
              date_time: { fallback_value: "Feb 02" }
            }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "date_time",
      date_time: { fallback_value: "Feb 02" }
    });
  });

  it("supports mixed body parameter types in a single component", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "John" },
            {
              type: "currency",
              currency: { fallback_value: "$10", code: "USD", amount_1000: 10000 }
            },
            {
              type: "date_time",
              dateTime: { fallbackValue: "Tomorrow" }
            }
          ]
        }
      ]
    });

    const [text, currency, dateTime] = payload.components[0].parameters ?? [];
    expect(text).toMatchObject({ type: "text", text: "John" });
    expect(currency).toMatchObject({ type: "currency" });
    expect(dateTime).toMatchObject({ type: "date_time" });
  });

  it("throws when date_time parameter lacks fallback_value", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "date_time",
                date_time: {}
              }
            ]
          }
        ]
      })
    ).toThrowError(/date_time\.fallback_value must be a string/i);
  });

  it("accepts header location parameters", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "location",
              location: { latitude: "10.2", longitude: -70.3, name: "HQ" }
            }
          ]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "location",
      location: { latitude: "10.2", longitude: -70.3, name: "HQ" }
    });
  });

  it("accepts header image referenced by id only", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [{ type: "image", image: { id: "MEDIA123" } }]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "image",
      image: { id: "MEDIA123" }
    });
  });

  it("accepts header video by link", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [{ type: "video", video: { link: "https://example.com/video.mp4" } }]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "video",
      video: { link: "https://example.com/video.mp4" }
    });
  });

  it("accepts header document by media id", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [{ type: "document", document: { id: "DOC123" } }]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({
      type: "document",
      document: { id: "DOC123" }
    });
  });

  it("throws when header text parameter is empty", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "header",
            parameters: [{ type: "text", text: "" }]
          }
        ]
      })
    ).toThrowError(/parameters\[0\]\.text must be a non-empty string/i);
  });

  it("normalizes a full Meta send payload", () => {
    const payload = buildTemplatePayload({
      name: "order_confirmation",
      language: "en_US",
      components: [
        {
          type: "HEADER",
          parameters: [
            { type: "image", image: { link: "https://example.com/banner.png" } }
          ]
        },
        {
          type: "BODY",
          parameters: [
            { type: "text", text: "Pablo" },
            { type: "text", text: "860198-230332" }
          ]
        },
        {
          type: "BUTTON",
          sub_type: "PHONE_NUMBER",
          index: "0",
          parameters: [{ type: "text", text: "15550051310" }]
        },
        {
          type: "BUTTON",
          sub_type: "URL",
          index: "1",
          parameters: [{ type: "TEXT", text: "support" }]
        }
      ]
    });

    expect(payload).toEqual({
      name: "order_confirmation",
      language: { code: "en_US" },
      components: [
        {
          type: "header",
          parameters: [
            { type: "image", image: { link: "https://example.com/banner.png" } }
          ]
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: "Pablo" },
            { type: "text", text: "860198-230332" }
          ]
        },
        {
          type: "button",
          subType: "phone_number",
          index: 0,
          parameters: [{ type: "text", text: "15550051310" }]
        },
        {
          type: "button",
          subType: "url",
          index: 1,
          parameters: [{ type: "text", text: "support" }]
        }
      ]
    });
  });

  it("accepts quick reply buttons and normalizes casing", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "BUTTON",
          sub_type: "QUICK_REPLY",
          index: "0",
          parameters: [{ type: "PAYLOAD", payload: "STOP" }]
        }
      ]
    });

    expect(payload.components[0]).toMatchObject({
      subType: "quick_reply",
      parameters: [{ type: "payload", payload: "STOP" }]
    });
  });

  it("normalizes a location header followed by quick reply button", () => {
    const payload = buildTemplatePayload({
      name: "tpl_flow",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [{ type: "location", location: { latitude: 1, longitude: 2 } }]
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: 0,
          parameters: [{ type: "payload", payload: "CONFIRM" }]
        }
      ]
    });

    expect(payload.components[0]).toMatchObject({ type: "header" });
    expect(payload.components[1]).toMatchObject({ subType: "quick_reply" });
  });

  it("accepts flow buttons with and without parameters", () => {
    const withParams = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: 1,
          parameters: [{ type: "PAYLOAD", payload: { step: "one" } }]
        }
      ]
    });

    expect(withParams.components[0]).toMatchObject({
      subType: "flow",
      parameters: [{ type: "payload", payload: { step: "one" } }]
    });

    const withoutParams = buildTemplatePayload({
      name: "tpl_no_params",
      language: "en_US",
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: 0
        }
      ]
    });

    expect(withoutParams.components[0]).not.toHaveProperty("parameters");
  });

  it("accepts flow button with action parameter (pass-through)", () => {
    const payload = buildTemplatePayload({
      name: "tpl_flow_action",
      language: "en_US",
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: 0,
          parameters: [
            {
              type: "ACTION",
              action: {
                flow_token: "FLOW_TOKEN",
                flow_action_data: { x: 1 }
              }
            }
          ]
        }
      ]
    });

    expect(payload.components[0]).toMatchObject({
      type: "button",
      subType: "flow",
      parameters: [
        {
          type: "action",
          action: {
            flow_token: "FLOW_TOKEN",
            flow_action_data: { x: 1 }
          }
        }
      ]
    });
  });

  it("rejects unknown top-level keys", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "hi" }]
          }
        ],
        category: "MARKETING"
      } as any)
    ).toThrowError(/unrecognized key/i);
  });

  it("throws when header has multiple parameters", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "header",
            parameters: [
              { type: "text", text: "hello" },
              { type: "text", text: "world" }
            ]
          }
        ]
      })
    ).toThrowError(/exactly one entry/i);
  });

  it("throws when header parameters is not an array", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "header",
            parameters: null as any
          }
        ]
      })
    ).toThrowError(/components\[0\]\.parameters must be an array with exactly one entry/i);
  });

  it("throws when header parameter type is unsupported", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "header",
            parameters: [{ type: "unknown" }]
          }
        ]
      })
    ).toThrowError(/type 'unknown' is not supported/i);
  });

  it("throws when header media link is invalid", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "header",
            parameters: [
              { type: "image", image: { link: "notaurl" } }
            ]
          }
        ]
      })
    ).toThrowError(/must be a valid URL/i);
  });

  it("throws when button index is out of range", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            subType: "url",
            index: 10,
            parameters: [{ type: "text", text: "promo" }]
          }
        ]
      })
    ).toThrowError(/index must be an integer between 0 and 9/i);
  });

  it("throws when button sub_type is missing", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            index: 0,
            parameters: [{ type: "text", text: "ok" }]
          }
        ]
      } as any)
    ).toThrowError(/components\[0\]\.sub_type/i);
  });

  it("throws when button index is missing", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            sub_type: "url",
            parameters: [{ type: "text", text: "promo" }]
          }
        ]
      } as any)
    ).toThrowError(/components\[0\]\.index is required/);
  });

  it("throws when currency amount is not integer", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "currency",
                currency: {
                  fallback_value: "$10",
                  code: "USD",
                  amount_1000: "not-int"
                }
              }
            ]
          }
        ]
      })
    ).toThrowError(/amount_1000 must be an integer/i);
  });

  it("throws when body parameters is not array", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "body",
            parameters: null as any
          }
        ]
      })
    ).toThrowError(/must be a non-empty array/i);
  });

  it("throws on unsupported button subtype", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            subType: "unsupported",
            index: 0,
            parameters: []
          }
        ]
      })
    ).toThrowError(/sub_type 'unsupported'/i);
  });

  it("throws when quick reply button lacks payload", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "BUTTON",
            sub_type: "QUICK_REPLY",
            index: 0,
            parameters: [{ type: "text", text: "bad" }]
          }
        ]
      })
    ).toThrowError(/parameters\[0\]\.type must be 'payload'/i);
  });

  it("throws when url button text parameter is empty", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            subType: "url",
            index: 1,
            parameters: [{ type: "text", text: "" }]
          }
        ]
      })
    ).toThrowError(/parameters\[0\]\.text must be a non-empty string/i);
  });

  it("throws when url button parameter type is not text", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            subType: "url",
            index: 1,
            parameters: [{ type: "payload", payload: "oops" }]
          }
        ]
      })
    ).toThrowError(/parameters\[0\]\.type must be 'text'/i);
  });

  it("allows phone number button without parameters", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "button",
          subType: "PHONE_NUMBER",
          index: "2"
        }
      ]
    });

    expect(payload.components[0]).toMatchObject({
      type: "button",
      subType: "phone_number",
      index: 2
    });
  });

  it("validates copy code button length", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            subType: "copy_code",
            index: 0,
            parameters: [{ type: "text", text: "THIS_IS_TOO_LONG_FOR_COPY_CODE" }]
          }
        ]
      })
    ).toThrowError(/parameters\[0\]\.text must be <= 15/i);
  });

  it("throws when quick reply button has mixed parameter types", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            sub_type: "quick_reply",
            index: 0,
            parameters: [
              { type: "payload", payload: "OK" },
              { type: "text", text: "bad" }
            ]
          }
        ]
      })
    ).toThrowError(/parameters\[1\]\.type must be 'payload'/i);
  });

  it("throws when flow button parameters is not an array", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          {
            type: "button",
            sub_type: "flow",
            index: 0,
            parameters: { type: "payload" } as any
          }
        ]
      })
    ).toThrowError(/components\[0\]\.parameters must be an array/i);
  });

  it("throws for unsupported component types", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [
          { type: "FOOTER", text: "unsupported" }
        ]
      })
    ).toThrowError(/type 'FOOTER' is not supported/i);
  });

  it("accepts catalog subtype (pass-through)", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        { type: "button", sub_type: "catalog", index: 0 }
      ]
    });

    expect(payload.components[0]).toMatchObject({ type: "button", subType: "catalog", index: 0 });
  });

  it("throws when component type is missing", () => {
    expect(() =>
      buildTemplatePayload({
        name: "tpl",
        language: "en_US",
        components: [{} as any]
      })
    ).toThrowError(/components\[0\]\.type is required/);
  });

  it("rejects empty components array", () => {
    expect(() =>
      buildTemplatePayload({
        name: "welcome_to_kapso_v2",
        language: "en_US",
        components: []
      })
    ).toThrowError(/components/i);
  });

  it("preserves unknown keys on component parameters", () => {
    const payload = buildTemplatePayload({
      name: "tpl",
      language: "en_US",
      components: [
        {
          type: "header",
          parameters: [{ type: "text", text: "Hi", custom: "value" }]
        }
      ]
    });

    expect(payload.components[0].parameters?.[0]).toMatchObject({ custom: "value" });
  });
});
