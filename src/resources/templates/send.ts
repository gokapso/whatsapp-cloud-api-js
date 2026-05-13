import { z } from "zod";
import type {
  TemplateCarouselCard,
  TemplateSendPayload,
  TemplateButtonComponent,
  TemplateComponent
} from "./types";

// Header parameters for sending a template
const headerParamSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1), parameterName: z.string().min(1).optional() }),
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
  z.object({ type: z.literal("text"), text: z.string(), parameterName: z.string().min(1).optional() }),
  z.object({
    type: z.literal("currency"),
    currency: z.object({ fallbackValue: z.string(), code: z.string().min(1), amount1000: z.number().int() }),
    parameterName: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal("date_time"),
    dateTime: z.object({ fallbackValue: z.string() }),
    parameterName: z.string().min(1).optional()
  })
]);

// Button parameters
const buttonQuickReplySchema = z.object({
  type: z.literal("button"),
  subType: z.literal("quick_reply"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z
    .array(z.object({ type: z.literal("payload"), payload: z.string().min(1), parameterName: z.string().min(1).optional() }))
    .min(1)
});

const buttonUrlSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("url"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z
    .array(z.object({ type: z.literal("text"), text: z.string().min(1), parameterName: z.string().min(1).optional() }))
    .min(1)
});

const buttonPhoneSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("phone_number"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z
    .array(z.object({ type: z.literal("text"), text: z.string().min(1), parameterName: z.string().min(1).optional() }))
    .optional()
});

const buttonCopyCodeSchema = z.object({
  type: z.literal("button"),
  subType: z.literal("copy_code"),
  index: z.union([z.number().int().min(0).max(9), z.string()]),
  parameters: z
    .array(
      z.object({ type: z.literal("coupon_code"), coupon_code: z.string().min(1).max(15) })
    )
    .length(1)
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

const carouselCardComponentSchema = z.union([
  z.object({
    type: z.literal("header"),
    parameters: z.tuple([headerParamSchema])
  }),
  z.object({
    type: z.literal("body"),
    parameters: z.array(bodyParamSchema).min(1)
  }),
  buttonParamSchema
]);

const carouselCardSchema = z.object({
  cardIndex: z.number().int().min(0),
  components: z.array(carouselCardComponentSchema).min(1)
});

export const templateSendInputSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
  header: headerParamSchema.optional(),
  body: z.array(bodyParamSchema).optional(),
  cards: z.array(carouselCardSchema).min(1).optional(),
  buttons: z.array(buttonParamSchema).optional()
});

export type TemplateSendInput = z.infer<typeof templateSendInputSchema>;

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
  if (parsed.cards && parsed.cards.length > 0) {
    components.push({ type: "carousel", cards: parsed.cards as TemplateCarouselCard[] });
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
