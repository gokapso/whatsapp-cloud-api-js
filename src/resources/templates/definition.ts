import { z } from "zod";

const NAME_REGEX = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_REGEX = /^[a-z]{2}(?:_[A-Z]{2})?$/;
const CATEGORY_VALUES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;

const HEADER_TEXT_MAX = 60;
const BODY_TEXT_MAX = 1024;
const FOOTER_TEXT_MAX = 60;
const CAROUSEL_BODY_TEXT_MAX = 160;

const OTP_SIGNATURE_REGEX = /^[A-Za-z0-9+/=]{11}$/;
const PACKAGE_NAME_REGEX = /^(?:[a-zA-Z][a-zA-Z0-9_]*\.)+[a-zA-Z][a-zA-Z0-9_]*$/;

const positionalPlaceholderRegex = /\{\{\s*(\d+)\s*\}\}/g;
const namedPlaceholderRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function extractPlaceholders(text: string) {
  const positional = new Set<string>();
  const named = new Set<string>();

  text.replace(positionalPlaceholderRegex, (_, match: string) => {
    positional.add(match);
    return "";
  });

  text.replace(namedPlaceholderRegex, (_, match: string) => {
    if (!/^[0-9]+$/.test(match)) {
      named.add(match);
    }
    return "";
  });

  if (positional.size > 0 && named.size > 0) {
    throw new Error("Cannot mix positional and named placeholders in the same string");
  }

  return {
    positionalCount: positional.size,
    namedKeys: named
  };
}

const HeaderTextExampleSchema = z
  .object({ headerText: z.array(z.string().min(1)).min(1) })
  .or(
    z.object({
      headerTextNamedParams: z
        .array(
          z.object({
            paramName: z.string().regex(/^[a-z0-9_]+$/),
            example: z.string().min(1)
          })
        )
        .min(1)
    })
  );

const BodyTextExampleSchema = z
  .object({ bodyText: z.array(z.array(z.string().min(1)).min(1)).min(1) })
  .or(
    z.object({
      bodyTextNamedParams: z
        .array(
          z.object({
            paramName: z.string().regex(/^[a-z0-9_]+$/),
            example: z.string().min(1)
          })
        )
        .min(1)
    })
  );

const HeaderTextSchema = z
  .object({
    type: z.literal("HEADER"),
    format: z.literal("TEXT"),
    text: z.string().min(1).max(HEADER_TEXT_MAX),
    example: HeaderTextExampleSchema.optional()
  })
  .superRefine((value, ctx) => {
    const { positionalCount, namedKeys } = extractPlaceholders(value.text);

    if (positionalCount === 0 && namedKeys.size === 0) {
      if (value.example) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Header text example should be omitted when no placeholders are present",
          path: ["example"]
        });
      }
      return;
    }

    if (!value.example) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "headerText example is required when placeholders are present",
        path: ["example"]
      });
      return;
    }

    if (positionalCount > 0) {
      if (!("headerText" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "headerText array must be provided for positional placeholders",
          path: ["example"]
        });
      } else if (value.example.headerText.length !== positionalCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "headerText example count must match number of placeholders",
          path: ["example", "headerText"]
        });
      }
    } else {
      if (!("headerTextNamedParams" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "headerTextNamedParams must be provided for named placeholders",
          path: ["example"]
        });
      } else {
        const provided = new Set(value.example.headerTextNamedParams.map((entry) => entry.paramName));
        for (const key of namedKeys) {
          if (!provided.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Missing example for named parameter ${key}`,
              path: ["example", "headerTextNamedParams"]
            });
          }
        }
      }
    }
  });

const HeaderMediaSchema = z.object({
  type: z.literal("HEADER"),
  format: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
  example: z.object({ headerHandle: z.array(z.string().min(1)).min(1) })
});

const HeaderLocationSchema = z.object({
  type: z.literal("HEADER"),
  format: z.literal("LOCATION")
});

const HeaderComponentSchema = z.discriminatedUnion("format", [
  HeaderTextSchema,
  HeaderMediaSchema,
  HeaderLocationSchema,
  z.object({ type: z.literal("HEADER"), format: z.literal("PRODUCT") })
]);

const BodyComponentSchema = z
  .object({
    type: z.literal("BODY"),
    text: z.string().min(1).max(BODY_TEXT_MAX).optional(),
    example: BodyTextExampleSchema.optional(),
    addSecurityRecommendation: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.text && !value.addSecurityRecommendation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BODY component must include text or addSecurityRecommendation",
        path: ["text"]
      });
      return;
    }

    if (!value.text) {
      if (value.example) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Examples are not allowed when BODY text is omitted",
          path: ["example"]
        });
      }
      return;
    }

    const { positionalCount, namedKeys } = extractPlaceholders(value.text);
    const hasPlaceholders = positionalCount > 0 || namedKeys.size > 0;

    if (!hasPlaceholders) {
      return;
    }

    if (!value.example) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bodyText example is required when placeholders are present",
        path: ["example"]
      });
      return;
    }

    if (positionalCount > 0) {
      if (!("bodyText" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bodyText example must be provided for positional placeholders",
          path: ["example"]
        });
      } else {
        const firstRow = value.example.bodyText[0];
        if (!firstRow || firstRow.length !== positionalCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "bodyText example count must match number of placeholders",
            path: ["example", "bodyText"]
          });
        }
      }
    } else {
      if (!("bodyTextNamedParams" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bodyTextNamedParams must be provided for named placeholders",
          path: ["example"]
        });
      } else {
        const provided = new Set(value.example.bodyTextNamedParams.map((entry) => entry.paramName));
        for (const key of namedKeys) {
          if (!provided.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Missing example for named parameter ${key}`,
              path: ["example", "bodyTextNamedParams"]
            });
          }
        }
      }
    }
  });

const FooterComponentSchema = z
  .object({
    type: z.literal("FOOTER"),
    text: z.string().min(1).max(FOOTER_TEXT_MAX).optional(),
    codeExpirationMinutes: z.number().int().min(1).max(90).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.text && value.codeExpirationMinutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FOOTER must include text or codeExpirationMinutes",
        path: ["text"]
      });
    }

    if (value.codeExpirationMinutes !== undefined && value.codeExpirationMinutes > 10 && value.text) {
      // no additional rule beyond bounds, placeholder for future validations
    }
  });

type ButtonsComponent = {
  type: "BUTTONS";
  buttons: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "PHONE_NUMBER"; text: string; phoneNumber: string }
    | { type: "URL"; text: string; url: string; example?: string[] }
    | { type: "COPY_CODE"; example: string }
    | {
        type: "FLOW";
        text?: string;
        flowId?: string;
        flowName?: string;
        flowJson?: string;
        flowAction?: "navigate" | "data_exchange";
        navigateScreen?: string;
        icon?: "DOCUMENT" | "PROMOTION" | "REVIEW";
      }
    | { type: "CATALOG"; text: string }
    | { type: "MPM"; text: string }
    | { type: "SPM"; text: string }
    | {
        type: "OTP";
        otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
        text?: string;
        autofillText?: string;
        supportedApps?: Array<{ packageName: string; signatureHash: string }>;
        packageName?: string;
        signatureHash?: string;
      }
  >;
};

const TemplateComponentSchema = z.union([
  HeaderComponentSchema,
  BodyComponentSchema,
  FooterComponentSchema,
  // Buttons component added below
  z
    .object({
      type: z.literal("BUTTONS"),
      buttons: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
            z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phoneNumber: z.string().min(1).max(20) }),
            z.object({
              type: z.literal("URL"),
              text: z.string().min(1).max(25),
              url: z.string().min(1).max(2000),
              example: z.array(z.string().min(1)).min(1).max(1).optional()
            }).superRefine((v, ctx) => {
              const hasVar = /\{\{/.test(v.url);
              if (hasVar && !v.example) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL with variable requires example", path: ["example"] });
              }
            }),
            z.object({ type: z.literal("COPY_CODE"), example: z.string().min(1).max(15) }),
            z
              .object({
                type: z.literal("FLOW"),
                text: z.string().min(1).max(25).optional(),
                flowId: z.string().min(1).optional(),
                flowName: z.string().min(1).optional(),
                flowJson: z.string().min(1).optional(),
                flowAction: z.enum(["navigate", "data_exchange"]).optional(),
                navigateScreen: z.string().optional(),
                icon: z.enum(["DOCUMENT", "PROMOTION", "REVIEW"]).optional()
              })
              .superRefine((v, ctx) => {
                const keys = [v.flowId, v.flowName, v.flowJson].filter(Boolean).length;
                if (keys !== 1) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "FLOW button requires exactly one of flowId, flowName, or flowJson" });
                }
              }),
            z.object({ type: z.literal("CATALOG"), text: z.string().min(1).max(25) }),
            z.object({ type: z.literal("MPM"), text: z.string().min(1).max(25) }),
            z.object({ type: z.literal("SPM"), text: z.string().min(1).max(25) }),
            z
              .object({
                type: z.literal("OTP"),
                otpType: z.enum(["COPY_CODE", "ONE_TAP", "ZERO_TAP"]),
                text: z.string().min(1).max(25).optional(),
                autofillText: z.string().min(1).max(25).optional(),
                supportedApps: z
                  .array(
                    z.object({
                      packageName: z.string().regex(PACKAGE_NAME_REGEX, "Invalid package name"),
                      signatureHash: z.string().regex(OTP_SIGNATURE_REGEX, "signatureHash must be 11 characters base64 string")
                    })
                  )
                  .min(1)
                  .max(5)
                  .optional(),
                packageName: z.string().regex(PACKAGE_NAME_REGEX, "Invalid package name").optional(),
                signatureHash: z.string().regex(OTP_SIGNATURE_REGEX, "signatureHash must be 11 characters base64 string").optional()
              })
              .superRefine((v, ctx) => {
                if ((v.packageName && !v.signatureHash) || (!v.packageName && v.signatureHash)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "packageName and signatureHash must be provided together",
                    path: v.packageName ? ["signatureHash"] : ["packageName"]
                  });
                }
                if (v.supportedApps) {
                  v.supportedApps.forEach((app, index) => {
                    if (!OTP_SIGNATURE_REGEX.test(app.signatureHash)) {
                      ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "supportedApps.signatureHash must be 11 characters base64 string",
                        path: ["supportedApps", index, "signatureHash"]
                      });
                    }
                  });
                }
              })
          ])
        )
        .min(1)
    })
    .superRefine((value: ButtonsComponent, ctx) => {
      const btns = value.buttons as ButtonsComponent["buttons"];
      if (btns.length > 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A maximum of 10 buttons is allowed", path: ["buttons"] });
      }

      const urlCount = btns.filter((b) => b.type === "URL").length;
      if (urlCount > 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 2 URL buttons allowed", path: ["buttons"] });
      }

      const phoneCount = btns.filter((b) => b.type === "PHONE_NUMBER").length;
      if (phoneCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 PHONE_NUMBER button allowed", path: ["buttons"] });
      }

      const catalogCount = btns.filter((b) => b.type === "CATALOG").length;
      if (catalogCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 CATALOG button allowed", path: ["buttons"] });
      }

      const mpmCount = btns.filter((b) => b.type === "MPM").length;
      if (mpmCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 MPM button allowed", path: ["buttons"] });
      }

      const spmCount = btns.filter((b) => b.type === "SPM").length;
      if (spmCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 SPM button allowed", path: ["buttons"] });
      }

      const otpCount = btns.filter((b) => b.type === "OTP").length;
      if (otpCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 OTP button allowed", path: ["buttons"] });
      }

      if (btns.some((b) => b.type === "OTP") && value.buttons.length > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OTP buttons cannot be combined with other buttons", path: ["buttons"] });
      }

      // Grouping rule: quick replies must be contiguous and not interleaved with non-quick
      const isQuick = (t: ButtonsComponent["buttons"][number]) => t.type === "QUICK_REPLY";
      const groups: boolean[] = [];
      for (const b of btns) {
        const flag = isQuick(b);
        if (groups.length === 0 || groups[groups.length - 1] !== flag) {
          groups.push(flag);
        }
      }
      // valid groups: [true], [false], [true,false], [false,true]
      // invalid if groups length > 2
      if (groups.length > 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Quick reply buttons must be grouped, not interleaved", path: ["buttons"] });
      }
    }),
  z.object({
    type: z.literal("LIMITED_TIME_OFFER"),
    limitedTimeOffer: z.object({
      text: z.string().min(1).max(16),
      hasExpiration: z.boolean().optional()
    })
  }),
  z.object({ type: z.literal("CALL_PERMISSION_REQUEST") }),
  z
    .object({
      type: z.literal("CAROUSEL"),
      cards: z
        .array(
          z.object({
            components: z
              .array(
                z.discriminatedUnion("type", [
                  z.discriminatedUnion("format", [
                    z.object({
                      type: z.literal("HEADER"),
                      format: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
                      example: z.object({ headerHandle: z.array(z.string().min(1)).min(1) })
                    }),
                    z.object({ type: z.literal("HEADER"), format: z.literal("PRODUCT") })
                  ]),
                  z
                    .object({
                      type: z.literal("BODY"),
                      text: z.string().min(1).max(CAROUSEL_BODY_TEXT_MAX),
                      example: BodyTextExampleSchema.optional()
                    })
                    .superRefine((value, ctx) => {
                      const { positionalCount, namedKeys } = extractPlaceholders(value.text);
                      const hasPlaceholders = positionalCount > 0 || namedKeys.size > 0;
                      if (!hasPlaceholders) {
                        return;
                      }
                      if (!value.example) {
                        ctx.addIssue({
                          code: z.ZodIssueCode.custom,
                          message: "card body example is required when placeholders are present",
                          path: ["example"]
                        });
                        return;
                      }
                      if (positionalCount > 0) {
                        if (!("bodyText" in value.example)) {
                          ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: "card bodyText example must be provided for positional placeholders",
                            path: ["example"]
                          });
                        } else {
                          const firstRow = value.example.bodyText[0];
                          if (!firstRow || firstRow.length !== positionalCount) {
                            ctx.addIssue({
                              code: z.ZodIssueCode.custom,
                              message: "card bodyText example count must match number of placeholders",
                              path: ["example", "bodyText"]
                            });
                          }
                        }
                      } else {
                        if (!("bodyTextNamedParams" in value.example)) {
                          ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: "card bodyTextNamedParams must be provided for named placeholders",
                            path: ["example"]
                          });
                        } else {
                          const provided = new Set(value.example.bodyTextNamedParams.map((entry) => entry.paramName));
                          for (const key of namedKeys) {
                            if (!provided.has(key)) {
                              ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: `Missing example for named parameter ${key}`,
                                path: ["example", "bodyTextNamedParams"]
                              });
                            }
                          }
                        }
                      }
                    }),
                  z
                    .object({
                      type: z.literal("BUTTONS"),
                      buttons: z
                        .array(
                          z.discriminatedUnion("type", [
                            z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
                            z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().min(1).max(2000), example: z.array(z.string().min(1)).min(1).max(1).optional() }).superRefine((v, ctx) => {
                              const hasVar = /\{\{/.test(v.url);
                              if (hasVar && !v.example) {
                                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL with variable requires example", path: ["example"] });
                              }
                            }),
                            z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phoneNumber: z.string().min(1).max(20) }),
                            z.object({ type: z.literal("SPM"), text: z.string().min(1).max(25) })
                          ])
                        )
                        .min(1)
                        .max(2)
                    })
                    .superRefine((value, ctx) => {
                      const quickCount = value.buttons.filter((btn) => btn.type === "QUICK_REPLY").length;
                      if (quickCount > 1) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At most 1 quick reply per carousel card", path: ["buttons"] });
                      }
                    })
                ])
              )
              .min(1)
          })
        )
        .min(2)
        .max(10)
    })
]);

const TemplateDefinitionSchema = z
  .object({
    name: z.string().regex(NAME_REGEX, "Template name must be lowercase alphanumeric with underscores"),
    language: z.string().regex(LANGUAGE_REGEX, "Invalid language code"),
    category: z.enum(CATEGORY_VALUES),
    parameterFormat: z.enum(["NAMED", "POSITIONAL"]).optional(),
    messageSendTtlSeconds: z.number().int().positive().optional(),
    components: z.array(TemplateComponentSchema).nonempty()
  })
  .superRefine((value, ctx) => {
    const bodyComponents = value.components.filter((component) => component.type === "BODY");
    if (bodyComponents.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template must include a BODY component",
        path: ["components"]
      });
    } else if (bodyComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template cannot include more than one BODY component",
        path: ["components"]
      });
    }

    const headerComponents = value.components.filter((component) => component.type === "HEADER");
    if (headerComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template cannot include more than one HEADER component",
        path: ["components"]
      });
    }

    const footerComponents = value.components.filter((component) => component.type === "FOOTER");
    if (footerComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template cannot include more than one FOOTER component",
        path: ["components"]
      });
    }
    // LOCATION header only for UTILITY or MARKETING
    const hasLocationHeader = value.components.some((c: { type: string; format?: string }) => c.type === "HEADER" && c.format === "LOCATION");
    if (hasLocationHeader && !["UTILITY", "MARKETING"].includes(value.category)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "LOCATION headers are only allowed for UTILITY or MARKETING categories", path: ["components"] });
    }

    const limitedTimeOfferComponent = value.components.find((c) => c.type === "LIMITED_TIME_OFFER");
    if (limitedTimeOfferComponent && value.category !== "MARKETING") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "LIMITED_TIME_OFFER component allowed only for MARKETING category", path: ["components"] });
    }

    const callPermissionComponent = value.components.find((c) => c.type === "CALL_PERMISSION_REQUEST");
    if (callPermissionComponent && !["MARKETING", "UTILITY"].includes(value.category)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CALL_PERMISSION_REQUEST component allowed only for MARKETING or UTILITY categories", path: ["components"] });
    }

    const carouselComponents = value.components.filter((component) => component.type === "CAROUSEL");
    if (carouselComponents.length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Template cannot include more than one CAROUSEL component", path: ["components"] });
    }

    const otpButtonTemplate = value.components.some((component) => component.type === "BUTTONS" && component.buttons.some((btn: any) => btn.type === "OTP"));
    if (otpButtonTemplate && value.category !== "AUTHENTICATION") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OTP buttons are only allowed for AUTHENTICATION templates", path: ["components"] });
    }
  });

export type TemplateDefinitionInput = z.input<typeof TemplateDefinitionSchema>;
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;

export function buildTemplateDefinition(input: TemplateDefinitionInput): TemplateDefinition {
  return TemplateDefinitionSchema.parse(input);
}

export const __testing = {
  TemplateDefinitionSchema,
  HeaderComponentSchema,
  BodyComponentSchema
};
