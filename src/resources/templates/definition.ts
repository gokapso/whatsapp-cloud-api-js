import { z } from "zod";

const NAME_REGEX = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_REGEX = /^[a-z]{2}(?:_[A-Z]{2})?$/;
const CATEGORY_VALUES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;

const HEADER_TEXT_MAX = 60;
const BODY_TEXT_MAX = 1024;
const FOOTER_TEXT_MAX = 60;

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
  .object({ header_text: z.array(z.string().min(1)).min(1) })
  .or(
    z.object({
      header_text_named_params: z
        .array(
          z.object({
            param_name: z.string().regex(/^[a-z0-9_]+$/),
            example: z.string().min(1)
          })
        )
        .min(1)
    })
  );

const BodyTextExampleSchema = z
  .object({ body_text: z.array(z.array(z.string().min(1)).min(1)).min(1) })
  .or(
    z.object({
      body_text_named_params: z
        .array(
          z.object({
            param_name: z.string().regex(/^[a-z0-9_]+$/),
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
        message: "header_text example is required when placeholders are present",
        path: ["example"]
      });
      return;
    }

    if (positionalCount > 0) {
      if (!("header_text" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "header_text array must be provided for positional placeholders",
          path: ["example"]
        });
      } else if (value.example.header_text.length !== positionalCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "header_text example count must match number of placeholders",
          path: ["example", "header_text"]
        });
      }
    } else {
      if (!("header_text_named_params" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "header_text_named_params must be provided for named placeholders",
          path: ["example"]
        });
      } else {
        const provided = new Set(value.example.header_text_named_params.map((entry) => entry.param_name));
        for (const key of namedKeys) {
          if (!provided.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Missing example for named parameter ${key}`,
              path: ["example", "header_text_named_params"]
            });
          }
        }
      }
    }
  });

const HeaderMediaSchema = z.object({
  type: z.literal("HEADER"),
  format: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
  example: z.object({ header_handle: z.array(z.string().min(1)).min(1) })
});

const HeaderLocationSchema = z.object({
  type: z.literal("HEADER"),
  format: z.literal("LOCATION")
});

const HeaderComponentSchema = z.discriminatedUnion("format", [
  HeaderTextSchema,
  HeaderMediaSchema,
  HeaderLocationSchema
]);

const BodyComponentSchema = z
  .object({
    type: z.literal("BODY"),
    text: z.string().min(1).max(BODY_TEXT_MAX),
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
        message: "body_text example is required when placeholders are present",
        path: ["example"]
      });
      return;
    }

    if (positionalCount > 0) {
      if (!("body_text" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "body_text example must be provided for positional placeholders",
          path: ["example"]
        });
      } else {
        const firstRow = value.example.body_text[0];
        if (!firstRow || firstRow.length !== positionalCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "body_text example count must match number of placeholders",
            path: ["example", "body_text"]
          });
        }
      }
    } else {
      if (!("body_text_named_params" in value.example)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "body_text_named_params must be provided for named placeholders",
          path: ["example"]
        });
      } else {
        const provided = new Set(value.example.body_text_named_params.map((entry) => entry.param_name));
        for (const key of namedKeys) {
          if (!provided.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Missing example for named parameter ${key}`,
              path: ["example", "body_text_named_params"]
            });
          }
        }
      }
    }
  });

const FooterComponentSchema = z.object({
  type: z.literal("FOOTER"),
  text: z.string().min(1).max(FOOTER_TEXT_MAX)
});

type ButtonsComponent = {
  type: "BUTTONS";
  buttons: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }
    | { type: "URL"; text: string; url: string; example?: string[] }
    | { type: "COPY_CODE"; example: string }
    | {
        type: "FLOW";
        text?: string;
        flow_id?: string;
        flow_name?: string;
        flow_json?: string;
        flow_action?: "navigate" | "data_exchange";
        navigate_screen?: string;
        icon?: "DOCUMENT" | "PROMOTION" | "REVIEW";
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
            z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().min(1).max(20) }),
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
                flow_id: z.string().min(1).optional(),
                flow_name: z.string().min(1).optional(),
                flow_json: z.string().min(1).optional(),
                flow_action: z.enum(["navigate", "data_exchange"]).optional(),
                navigate_screen: z.string().optional(),
                icon: z.enum(["DOCUMENT", "PROMOTION", "REVIEW"]).optional()
              })
              .superRefine((v, ctx) => {
                const keys = [v.flow_id, v.flow_name, v.flow_json].filter(Boolean).length;
                if (keys !== 1) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "FLOW button requires exactly one of flow_id, flow_name, or flow_json" });
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
    })
]);

const TemplateDefinitionSchema = z
  .object({
    name: z.string().regex(NAME_REGEX, "Template name must be lowercase alphanumeric with underscores"),
    language: z.string().regex(LANGUAGE_REGEX, "Invalid language code"),
    category: z.enum(CATEGORY_VALUES),
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
