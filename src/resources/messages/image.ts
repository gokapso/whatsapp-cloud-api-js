import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const mediaSchema = z.object({
  id: z.string().min(1).optional(),
  link: z.string().url().optional(),
  caption: z.string().max(1024).optional() // 1024 char limit per Meta docs
}).refine((value) => Boolean(value.id || value.link), {
  message: "Either id or link must be provided"
});

const imageMessageSchema = baseMessageSchema.extend({
  image: mediaSchema
});

type ImageMessageInput = z.infer<typeof imageMessageSchema>;

export class ImageMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: ImageMessageInput) {
    const parsed = imageMessageSchema.parse(input);

    const payload = buildBasePayload(parsed, {
      type: "image",
      image: parsed.image
    });

    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
