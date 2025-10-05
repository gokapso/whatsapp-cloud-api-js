import { z } from "zod";
import { baseMessageSchema, buildBasePayload, MessageSendClient } from "./base";

const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  type: z.string().optional()
});

const emailSchema = z.object({
  email: z.string().optional(),
  type: z.string().optional()
});

const phoneSchema = z.object({
  phone: z.string().optional(),
  wa_id: z.string().optional(),
  type: z.string().optional()
});

const urlSchema = z.object({
  url: z.string().optional(),
  type: z.string().optional()
});

const nameSchema = z.object({
  formatted_name: z.string().min(1, "formatted_name is required"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  middle_name: z.string().optional(),
  suffix: z.string().optional(),
  prefix: z.string().optional()
});

const orgSchema = z.object({
  company: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional()
});

const contactSchema = z.object({
  name: nameSchema,
  birthday: z.string().optional(),
  addresses: z.array(addressSchema).optional(),
  emails: z.array(emailSchema).optional(),
  org: orgSchema.optional(),
  phones: z.array(phoneSchema).optional(),
  urls: z.array(urlSchema).optional()
});

const contactsMessageSchema = baseMessageSchema.extend({
  contacts: z.array(contactSchema).min(1, "At least one contact is required")
});

export type ContactsMessageInput = z.infer<typeof contactsMessageSchema>;

export class ContactsMessageSender {
  constructor(private readonly client: MessageSendClient) {}

  async send(input: ContactsMessageInput) {
    const parsed = contactsMessageSchema.parse(input);
    const payload = buildBasePayload(parsed, {
      type: "contacts",
      contacts: parsed.contacts
    });
    return this.client.sendMessageRequest(parsed.phoneNumberId, payload);
  }
}
