import { z } from "zod";
import type { WhatsAppClient } from "../../client";
import type { SendMessageResponse } from "../../types";

export const baseMessageSchema = z.object({
  phoneNumberId: z.string().min(1, "phoneNumberId is required"),
  to: z.string().min(1, "to is required"),
  recipientType: z.enum(["individual", "group"]).optional(),
  contextMessageId: z.string().min(1).optional(),
  bizOpaqueCallbackData: z.string().max(512).optional()
});

export type BaseMessageFields = z.infer<typeof baseMessageSchema>;

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
  const payload: Record<string, unknown> = {
    messagingProduct: "whatsapp",
    recipientType: input.recipientType ?? "individual",
    to: input.to,
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
