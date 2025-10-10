import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const MAX_BODY_CHARS = 1024;
const MAX_FOOTER_CHARS = 60;
const MAX_BUTTON_LABEL = 20;
const MAX_SECTION_TITLE = 24;

function parseInput<T>(schema: z.ZodSchema<T>, input: unknown, context: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`${context} validation failed: ${details}`);
}

const textHeaderSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_FOOTER_CHARS)
});

const buttonOptionSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(MAX_BUTTON_LABEL)
});

const buttonMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  header: textHeaderSchema.optional(),
  buttons: z.array(buttonOptionSchema).min(1).max(3)
});

const listRowSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(MAX_SECTION_TITLE),
  description: z.string().max(72).optional()
});

const listSectionSchema = z.object({
  title: z.string().max(MAX_SECTION_TITLE).optional(),
  rows: z.array(listRowSchema).min(1).max(10)
});

const listMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  buttonText: z.string().min(1).max(MAX_BUTTON_LABEL),
  sections: z.array(listSectionSchema).min(1).max(10),
  header: textHeaderSchema.optional(),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional()
});

const productMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS).optional(),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  header: textHeaderSchema.optional(),
  catalogId: z.string().min(1),
  productRetailerId: z.string().min(1)
});

const productItemSchema = z.object({
  productRetailerId: z.string().min(1)
});

const productListSectionSchema = z.object({
  title: z.string().min(1).max(MAX_SECTION_TITLE),
  productItems: z.array(productItemSchema).min(1).max(30)
});

const productListMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  header: textHeaderSchema.optional(),
  catalogId: z.string().min(1),
  sections: z.array(productListSectionSchema).min(1).max(10)
});

const flowActionPayloadSchema = z.object({}).catchall(z.unknown());

const addressSavedAddressSchema = z.object({
  id: z.string().min(1),
  value: z.object({
    name: z.string().optional(),
    phoneNumber: z.string().optional(),
    inPinCode: z.string().optional(),
    floorNumber: z.string().optional(),
    buildingName: z.string().optional(),
    address: z.string().optional(),
    landmarkArea: z.string().optional(),
    city: z.string().optional()
  }).catchall(z.unknown())
});

const addressParametersSchema = z.object({
  country: z.string().length(2),
  values: z.object({}).catchall(z.unknown()).optional(),
  savedAddresses: z.array(addressSavedAddressSchema).optional(),
  validationErrors: z.object({}).catchall(z.unknown()).optional()
});

const addressMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  parameters: addressParametersSchema
});

const locationRequestParametersSchema = z.object({
  requestMessage: z.string().min(1).max(MAX_BODY_CHARS)
});

const locationRequestMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  parameters: locationRequestParametersSchema
});

const callPermissionParametersSchema = z.object({
  phoneNumber: z.string().min(1),
  callPurpose: z.string().max(MAX_BODY_CHARS).optional()
});

const callPermissionMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  parameters: callPermissionParametersSchema
});

const flowParametersSchema = z.object({
  flowId: z.string().min(1),
  flowCta: z.string().min(1).max(MAX_BUTTON_LABEL),
  flowMessageVersion: z.string().min(1).optional(),
  flowToken: z.string().optional(),
  flowAction: z.enum(["navigate", "data_exchange"]).optional(),
  flowActionPayload: flowActionPayloadSchema.optional()
});

const flowMessageSchema = baseMessageSchema.extend({
  bodyText: z.string().min(1).max(MAX_BODY_CHARS),
  footerText: z.string().max(MAX_FOOTER_CHARS).optional(),
  header: textHeaderSchema.optional(),
  parameters: flowParametersSchema
});

type ButtonMessageInput = z.infer<typeof buttonMessageSchema>;
type ListMessageInput = z.infer<typeof listMessageSchema>;
type ProductMessageInput = z.infer<typeof productMessageSchema>;
type ProductListMessageInput = z.infer<typeof productListMessageSchema>;
type FlowMessageInput = z.infer<typeof flowMessageSchema>;

export type ButtonInteractiveInput = ButtonMessageInput;
export type ListInteractiveInput = ListMessageInput;
export type ProductInteractiveInput = ProductMessageInput;
export type ProductListInteractiveInput = ProductListMessageInput;
export type FlowInteractiveInput = FlowMessageInput;
export type AddressInteractiveInput = z.infer<typeof addressMessageSchema>;
export type LocationRequestInteractiveInput = z.infer<typeof locationRequestMessageSchema>;
export type CallPermissionInteractiveInput = z.infer<typeof callPermissionMessageSchema>;
export interface RawInteractiveInput {
  phoneNumberId: string;
  to: string;
  recipientType?: "individual";
  contextMessageId?: string;
  bizOpaqueCallbackData?: string;
  interactive: Record<string, unknown>;
}

function buildHeader(header?: z.infer<typeof textHeaderSchema>) {
  return header ? { ...header } : undefined;
}

function buildFooter(text?: string) {
  return text ? { text } : undefined;
}

export class InteractiveMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async sendButtons(input: ButtonMessageInput) {
    const parsed = parseInput(buttonMessageSchema, input, "Button interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, header, buttons } = parsed;

    const interactive = {
      type: "button" as const,
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn) => ({
          type: "reply" as const,
          reply: { id: btn.id, title: btn.title }
        }))
      }
    };

    const builtHeader = buildHeader(header);
    if (builtHeader) {
      Object.assign(interactive, { header: builtHeader });
    }
    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendList(input: ListMessageInput) {
    const parsed = parseInput(listMessageSchema, input, "List interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, buttonText, sections, header, footerText } = parsed;

    const interactive = {
      type: "list" as const,
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: sections.map((section) => ({
          ...(section.title ? { title: section.title } : {}),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {})
          }))
        }))
      }
    };

    const builtHeader = buildHeader(header);
    if (builtHeader) {
      Object.assign(interactive, { header: builtHeader });
    }
    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendProduct(input: ProductMessageInput) {
    const parsed = parseInput(productMessageSchema, input, "Product interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, header, catalogId, productRetailerId } = parsed;

    const interactive: Record<string, unknown> = {
      type: "product",
      action: {
        catalogId,
        productRetailerId
      }
    };

    if (bodyText) {
      interactive.body = { text: bodyText };
    }
    const builtHeader = buildHeader(header);
    if (builtHeader) {
      Object.assign(interactive, { header: builtHeader });
    }
    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendProductList(input: ProductListMessageInput) {
    const parsed = parseInput(productListMessageSchema, input, "Product list interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, header, catalogId, sections } = parsed;

    const interactive: Record<string, unknown> = {
      type: "product_list",
      body: { text: bodyText },
      action: {
        catalogId,
        sections: sections.map((section) => ({
          title: section.title,
          productItems: section.productItems.map((item) => ({
            productRetailerId: item.productRetailerId
          }))
        }))
      }
    };

    const builtHeader = buildHeader(header);
    if (builtHeader) {
      Object.assign(interactive, { header: builtHeader });
    }
    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendFlow(input: FlowMessageInput) {
    const parsed = parseInput(flowMessageSchema, input, "Flow interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, header, parameters } = parsed;

    const interactive: Record<string, unknown> = {
      type: "flow",
      body: { text: bodyText },
      action: {
        name: "flow",
        parameters: {
          flowCta: parameters.flowCta,
          flowId: parameters.flowId,
          flowMessageVersion: parameters.flowMessageVersion ?? "3",
          ...(parameters.flowToken ? { flowToken: parameters.flowToken } : {}),
          ...(parameters.flowAction ? { flowAction: parameters.flowAction } : {}),
          ...(parameters.flowActionPayload ? { flowActionPayload: parameters.flowActionPayload } : {})
        }
      }
    };

    const builtHeader = buildHeader(header);
    if (builtHeader) {
      Object.assign(interactive, { header: builtHeader });
    }
    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendAddress(input: AddressInteractiveInput) {
    const parsed = parseInput(addressMessageSchema, input, "Address interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, parameters } = parsed;

    const interactive: Record<string, unknown> = {
      type: "address_message",
      body: { text: bodyText },
      action: {
        name: "address_message",
        parameters: {
          country: parameters.country,
          ...(parameters.values ? { values: parameters.values } : {}),
          ...(parameters.savedAddresses ? { savedAddresses: parameters.savedAddresses } : {}),
          ...(parameters.validationErrors ? { validationErrors: parameters.validationErrors } : {})
        }
      }
    };

    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendLocationRequest(input: LocationRequestInteractiveInput) {
    const parsed = parseInput(locationRequestMessageSchema, input, "Location request interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, parameters } = parsed;

    const interactive: Record<string, unknown> = {
      type: "location_request_message",
      body: { text: bodyText },
      action: {
        name: "location_request_message",
        parameters: {
          requestMessage: parameters.requestMessage
        }
      }
    };

    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendCallPermissionRequest(input: CallPermissionInteractiveInput) {
    const parsed = parseInput(callPermissionMessageSchema, input, "Call permission interactive message");
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, bodyText, footerText, parameters } = parsed;

    const interactive: Record<string, unknown> = {
      type: "call_permission_request",
      body: { text: bodyText },
      action: {
        name: "call_permission_request",
        parameters: {
          phoneNumber: parameters.phoneNumber,
          ...(parameters.callPurpose ? { callPurpose: parameters.callPurpose } : {})
        }
      }
    };

    const footer = buildFooter(footerText);
    if (footer) {
      Object.assign(interactive, { footer });
    }

    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );

    return this.client.sendMessageRequest(phoneNumberId, payload);
  }

  async sendRaw(input: RawInteractiveInput) {
    const { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData, interactive } = input;
    const payload = buildBasePayload(
      { phoneNumberId, to, recipientType, contextMessageId, bizOpaqueCallbackData },
      { type: "interactive", interactive }
    );
    return this.client.sendMessageRequest(phoneNumberId, payload);
  }
}
