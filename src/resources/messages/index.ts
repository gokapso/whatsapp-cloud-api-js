import type { WhatsAppClient } from "../../client";
import type { SendMessageResponse } from "../../types";
import { MessageTransport } from "./base";
import type { GraphSuccessResponse } from "../../types";
import { TextMessageSender } from "./text";
import { ImageMessageSender } from "./image";
import {
  AudioMessageSender,
  DocumentMessageSender,
  StickerMessageSender,
  VideoMessageSender
} from "./media";
import { LocationMessageSender } from "./location";
import { ContactsMessageSender } from "./contacts";
import { TemplateMessageSender } from "./template";
import { ReactionMessageSender } from "./reaction";
import {
  InteractiveMessageSender,
  ButtonInteractiveInput,
  ListInteractiveInput,
  ProductInteractiveInput,
  ProductListInteractiveInput,
  FlowInteractiveInput,
  AddressInteractiveInput,
  LocationRequestInteractiveInput,
  CallPermissionInteractiveInput,
  RawInteractiveInput
} from "./interactive";

/**
 * Send WhatsApp messages of all supported types.
 *
 * All methods return a typed SendMessageResponse.
 * @category Messages
 */
export class MessagesResource {
  private readonly transport: MessageTransport;
  private readonly textSender: TextMessageSender;
  private readonly imageSender: ImageMessageSender;
  private readonly audioSender: AudioMessageSender;
  private readonly documentSender: DocumentMessageSender;
  private readonly videoSender: VideoMessageSender;
  private readonly stickerSender: StickerMessageSender;
  private readonly locationSender: LocationMessageSender;
  private readonly contactsSender: ContactsMessageSender;
  private readonly templateSender: TemplateMessageSender;
  private readonly reactionSender: ReactionMessageSender;
  private readonly interactiveSender: InteractiveMessageSender;

  constructor(private readonly client: WhatsAppClient) {
    this.transport = new MessageTransport(client);
    this.textSender = new TextMessageSender(this.transport);
    this.imageSender = new ImageMessageSender(this.transport);
    this.audioSender = new AudioMessageSender(this.transport);
    this.documentSender = new DocumentMessageSender(this.transport);
    this.videoSender = new VideoMessageSender(this.transport);
    this.stickerSender = new StickerMessageSender(this.transport);
    this.locationSender = new LocationMessageSender(this.transport);
    this.contactsSender = new ContactsMessageSender(this.transport);
    this.templateSender = new TemplateMessageSender(this.transport);
    this.reactionSender = new ReactionMessageSender(this.transport);
    this.interactiveSender = new InteractiveMessageSender(this.transport);
  }

  async sendText(input: Parameters<TextMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.textSender.send(input);
  }

  async sendImage(input: Parameters<ImageMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.imageSender.send(input);
  }

  async sendAudio(input: Parameters<AudioMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.audioSender.send(input);
  }

  async sendDocument(input: Parameters<DocumentMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.documentSender.send(input);
  }

  async sendVideo(input: Parameters<VideoMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.videoSender.send(input);
  }

  async sendSticker(input: Parameters<StickerMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.stickerSender.send(input);
  }

  async sendLocation(input: Parameters<LocationMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.locationSender.send(input);
  }

  async sendContacts(input: Parameters<ContactsMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.contactsSender.send(input);
  }

  async sendTemplate(input: Parameters<TemplateMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.templateSender.send(input);
  }

  async sendReaction(input: Parameters<ReactionMessageSender["send"]>[0]): Promise<SendMessageResponse> {
    return this.reactionSender.send(input);
  }

  async sendInteractiveButtons(input: ButtonInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendButtons(input);
  }

  async sendInteractiveList(input: ListInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendList(input);
  }

  async sendInteractiveProduct(input: ProductInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendProduct(input);
  }

  async sendInteractiveProductList(input: ProductListInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendProductList(input);
  }

  async sendInteractiveFlow(input: FlowInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendFlow(input);
  }

  async sendInteractiveAddress(input: AddressInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendAddress(input);
  }

  async sendInteractiveLocationRequest(input: LocationRequestInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendLocationRequest(input);
  }

  async sendInteractiveCallPermission(input: CallPermissionInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendCallPermissionRequest(input);
  }

  async sendInteractiveRaw(input: RawInteractiveInput): Promise<SendMessageResponse> {
    return this.interactiveSender.sendRaw(input);
  }

  async markRead(input: { phoneNumberId: string; messageId: string }): Promise<GraphSuccessResponse> {
    const payload = {
      messaging_product: "whatsapp",
      status: "read" as const,
      message_id: input.messageId
    };

    return this.client.request<GraphSuccessResponse>("POST", `${input.phoneNumberId}/messages`, {
      body: payload,
      responseType: "json"
    });
  }
}
