import { z } from "zod";
import type { TemplateSendPayload, TemplateButtonComponent, TemplateComponent } from "./types";

// Header parameters for sending a template
const headerParamSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z.object({
    type: z.literal("image"),
    image: z.object({ id: z.string().min(1).optional(), link: z.string().url().optional() }).refine((v) => !!(v.id || v.link), {
      message: "image requires id or link"
    })
  }),
  z.object({
    type: z.literal("video"),
    video: z.object({ id: z.string().min(1).optional(), link: z.string().url().optional() }).refine((v) => !!(v.id || v.link), {
      message: "video requires id or link"
    })
  }),
  z.object({
    type: z.literal("document"),
    document: z.object({ id: z.string().min(1).optional(), link: z.string().url().optional() }).refine((v) => !!(v.id || v.link), {
      message: "document requires id or link"
    })
  }),
  z.object({
    type: z.literal("location"),
    location: z.object({
      latitude: z.union([z.number(), z.string()]),
      longitude: z.union([z.number(), z.string()]),
      name: z.string().min(1).optional(),
      address: z.string().min(1).optional()
    })
  })
]);

// Body parameters
const bodyParamSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("currency"),
    currency: z.object({ fallbackValue: z.string(), code: z.string().min(1), amount1000: z.number().int() })
  }),
  z.object({ type: z.literal("date_time"), dateTime: z.object({ fallbackValue: z.string() }) })
]);

// Button parameters
const buttonQuickReplySchema = z.object({
  type: z.literal("button"),
  subType: z.literal("quick_reply"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z.array(z.object({ type: z.literal("payload"), payload: z.string().min(1) })).min(1)
});

const buttonUrlSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("url"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z.array(z.object({ type: z.literal("text"), text: z.string().min(1) })).min(1)
});

const buttonPhoneSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("phone_number"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z.array(z.object({ type: z.literal("text"), text: z.string().min(1) })).optional()
});

const buttonCopyCodeSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("copy_code"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z.array(z.object({ type: z.literal("text"), text: z.string().min(1).max(15) })).min(1)
});

const buttonFlowSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("flow"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z
    .array(
      z.object({
        type: z.literal("action"),
        action: z
          .object({
            flow_token: z.string().min(1).optional(),
            flow_action_data: z.object({}).catchall(z.any()).optional()
          })
      })
    )
    .optional()
});

const buttonParamSchema = z.union([buttonQuickReplySchema, buttonUrlSchema, buttonPhoneSchema, buttonCopyCodeSchema, buttonFlowSchema]);

export const templateSendInputSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
  header: headerParamSchema.optional(),
  body: z.array(bodyParamSchema).optional(),
  buttons: z.array(buttonParamSchema).optional()
});

export type TemplateSendInput = z.infer<typeof templateSendInputSchema>;

// Strongly-typed component shapes matching Meta wire schema (camelCase input; SDK snake-cases on send)
type HeaderComponent = { type: "header"; parameters: [z.infer<typeof headerParamSchema>] };
type BodyComponent = { type: "body"; parameters: Array<z.infer<typeof bodyParamSchema>> };
type ButtonComponent = z.infer<typeof buttonParamSchema>; // { type: 'button', subType: ..., index, parameters? }

/**
 * Build a Template message payload from typed parameters.
 * Validates placeholders and structure with Zod before returning the payload expected by Meta.
 * @category Templates
 */
export function buildTemplateSendPayload(input: TemplateSendInput): TemplateSendPayload {
  if (Object.prototype.hasOwnProperty.call(input as Record<string, unknown>, "components")) {
    throw new Error("buildTemplateSendPayload does not accept raw components; use buildTemplatePayload for Meta-style payloads");
  }

  const parsed = templateSendInputSchema.parse(input);

  const components: TemplateComponent[] = [];
  if (parsed.header) {
    components.push({ type: "header", parameters: [parsed.header] });
  }
  if (parsed.body && parsed.body.length > 0) {
    components.push({ type: "body", parameters: parsed.body });
  }
  if (parsed.buttons && parsed.buttons.length > 0) {
    for (const btn of parsed.buttons) {
      components.push(btn as TemplateButtonComponent);
    }
  }

  return {
    name: parsed.name,
    language: { code: parsed.language },
    components
  };
}
