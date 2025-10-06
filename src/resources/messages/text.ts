import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const textMessageSchema = baseMessageSchema.extend({
  body: z.string().min(1, "body must not be empty"),
  previewUrl: z.boolean().optional()
});

type TextMessageInput = z.infer<typeof textMessageSchema>;

export class TextMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: TextMessageInput) {
    const parsed = textMessageSchema.parse(input);

    const payload = buildBasePayload(parsed, {
      type: "text",
      text: {
        body: parsed.body,
        ...(parsed.previewUrl !== undefined ? { previewUrl: parsed.previewUrl } : {})
      }
    });

    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
