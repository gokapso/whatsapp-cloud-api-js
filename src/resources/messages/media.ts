import { z } from "zod";
import { RecipientAddress, baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const mediaRefBaseSchema = z.object({
  id: z.string().min(1).optional(),
  link: z.string().url().optional()
});

const withMediaRefine = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((value) => {
    const candidate = value as { id?: string | null; link?: string | null };
    return Boolean(candidate?.id || candidate?.link);
  }, {
    message: "Either id or link must be provided"
  });

const mediaRefSchema = withMediaRefine(mediaRefBaseSchema);

const documentSchema = withMediaRefine(mediaRefBaseSchema.extend({
  caption: z.string().max(1024).optional(),
  filename: z.string().max(240).optional()
}));

const videoSchema = withMediaRefine(mediaRefBaseSchema.extend({
  caption: z.string().max(1024).optional()
}));

const audioSchema = withMediaRefine(
  mediaRefBaseSchema.extend({
    voice: z.boolean().optional()
  })
);
const stickerSchema = mediaRefSchema;

const documentMessageSchema = baseMessageSchema.extend({
  document: documentSchema
});

const videoMessageSchema = baseMessageSchema.extend({
  video: videoSchema
});

const audioMessageSchema = baseMessageSchema.extend({
  audio: audioSchema
});

const stickerMessageSchema = baseMessageSchema.extend({
  sticker: stickerSchema
});

export type DocumentMessageInput = z.infer<typeof documentMessageSchema> & RecipientAddress;
export type VideoMessageInput = z.infer<typeof videoMessageSchema> & RecipientAddress;
export type AudioMessageInput = z.infer<typeof audioMessageSchema> & RecipientAddress;
export type StickerMessageInput = z.infer<typeof stickerMessageSchema> & RecipientAddress;

export class DocumentMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: DocumentMessageInput) {
    const parsed = documentMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "document",
      document: parsed.document
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}

export class VideoMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: VideoMessageInput) {
    const parsed = videoMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "video",
      video: parsed.video
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}

export class AudioMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: AudioMessageInput) {
    const parsed = audioMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "audio",
      audio: parsed.audio
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}

export class StickerMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: StickerMessageInput) {
    const parsed = stickerMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "sticker",
      sticker: parsed.sticker
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
