import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().max(100).optional(),
  address: z.string().max(300).optional()
});

const locationMessageSchema = baseMessageSchema.extend({
  location: locationSchema
});

export type LocationMessageInput = z.infer<typeof locationMessageSchema>;

export class LocationMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: LocationMessageInput) {
    const parsed = locationMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "location",
      location: parsed.location
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
