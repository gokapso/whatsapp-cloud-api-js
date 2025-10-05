import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const templateComponentSchema = z.object({
  type: z.string().min(1)
}).loose();

const templateSchema = z.object({
  name: z.string().min(1, "template name is required"),
  language: z.object({
    code: z.string().min(1, "language code is required")
  }),
  components: z.array(templateComponentSchema).optional()
});

const templateMessageSchema = baseMessageSchema.extend({
  template: templateSchema
});

export type TemplateMessageInput = z.infer<typeof templateMessageSchema>;

export class TemplateMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: TemplateMessageInput) {
    const parsed = templateMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "template",
      template: parsed.template
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
