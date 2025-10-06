import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const reactionSchema = z.object({
  messageId: z.string().min(1, "messageId is required"),
  emoji: z.string().max(2).optional()
});

const reactionMessageSchema = baseMessageSchema.extend({
  reaction: reactionSchema
});

export type ReactionMessageInput = z.infer<typeof reactionMessageSchema>;

export class ReactionMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: ReactionMessageInput) {
    const parsed = reactionMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "reaction",
      reaction: parsed.reaction
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
