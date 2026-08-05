import { z } from "zod";
import type { WhatsAppClient } from "../../client";
import type { SendMessageResponse } from "../../types";

export const baseMessageSchema = z.object({
  phoneNumberId: z.string().min(1, "phoneNumberId is required"),
  /** Recipient phone number. Optional since BSUIDs; provide this, recipient, or both. */
  to: z.string().min(1, "to must not be empty").optional(),
  /**
   * Recipient business-scoped user ID (BSUID), including the parent ENT
   * variant. When both to and recipient are present, Meta delivers to the
   * phone number and ignores the BSUID. Sending both is the recommended
   * default when you have both identifiers.
   */
  recipient: z.string().min(1, "recipient must not be empty").optional(),
  recipientType: z.enum(["individual", "group"]).optional(),
  contextMessageId: z.string().min(1).optional(),
  bizOpaqueCallbackData: z.string().max(512).optional()
});

export type BaseMessageFields = z.infer<typeof baseMessageSchema>;

/**
 * At least one of to / recipient, enforced at the type level. The runtime
 * guard in buildBasePayload backs it for untyped callers.
 */
export type RecipientAddress =
  | { to: string; recipient?: string }
  | { to?: string; recipient: string };

export interface MessageSendClient {
  sendMessageRequest(phoneNumberId: string, payload: Record<string, unknown>): Promise<SendMessageResponse>;
}

export class MessageTransport implements MessageSendClient {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async send(phoneNumberId: string, payload: Record<string, unknown>): Promise<SendMessageResponse> {
    return this.client.request<SendMessageResponse>("POST", `${phoneNumberId}/messages`, {
      body: payload,
      responseType: "json"
    });
  }

  async sendMessageRequest(phoneNumberId: string, payload: Record<string, unknown>): Promise<SendMessageResponse> {
    return this.send(phoneNumberId, payload);
  }
}

export function buildBasePayload(
  input: BaseMessageFields,
  rest: Record<string, unknown>
): Record<string, unknown> {
  if (!input.to && !input.recipient) {
    throw new Error(
      "Provide to (a phone number), recipient (a business-scoped user ID), or both."
    );
  }

  const payload: Record<string, unknown> = {
    messagingProduct: "whatsapp",
    recipientType: input.recipientType ?? "individual",
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.recipient !== undefined ? { recipient: input.recipient } : {}),
    ...rest
  };

  if (input.contextMessageId) {
    payload.context = { messageId: input.contextMessageId };
  }

  if (input.bizOpaqueCallbackData) {
    payload.bizOpaqueCallbackData = input.bizOpaqueCallbackData;
  }

  return payload;
}
