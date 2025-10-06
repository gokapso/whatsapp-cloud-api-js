import { z } from "zod";
import type { WhatsAppClient } from "../client";
import type { ContactListResponse, ContactRecord, GraphSuccessResponse } from "../types";

const listSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    waId: z.string().min(1).optional(),
    hasCustomer: z.boolean().optional(),
    customerId: z.string().uuid().optional(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional()
  })
  .passthrough();

const getSchema = z.object({
  phoneNumberId: z.string().min(1),
  waId: z.string().min(1)
});

const updateSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    waId: z.string().min(1),
    profileName: z.string().optional(),
    displayName: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .refine((value) => {
    const keys = Object.keys(value).filter((key) => !["phoneNumberId", "waId"].includes(key));
    return keys.length > 0;
  }, { message: "At least one field to update is required" });

function cleanQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined));
}

/**
 * Contacts directory helpers.
 * @category Contacts
 */
export class ContactsResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async list(input: z.infer<typeof listSchema>): Promise<ContactListResponse> {
    const { phoneNumberId, ...rest } = listSchema.parse(input);
    const query = cleanQuery(rest);
    return this.client.request<ContactListResponse>("GET", `${phoneNumberId}/contacts`, {
      query,
      responseType: "json"
    });
  }

  async get(input: z.infer<typeof getSchema>): Promise<ContactRecord> {
    const { phoneNumberId, waId } = getSchema.parse(input);
    const response = await this.client.request<ContactRecord | { data: ContactRecord }>(
      "GET",
      `${phoneNumberId}/contacts/${waId}`,
      { responseType: "json" }
    );

    if (response && typeof response === "object" && "data" in response) {
      return (response as { data: ContactRecord }).data;
    }

    return response as ContactRecord;
  }

  async update(input: z.infer<typeof updateSchema>): Promise<GraphSuccessResponse> {
    const { phoneNumberId, waId, ...body } = updateSchema.parse(input);
    return this.client.request<GraphSuccessResponse>("PATCH", `${phoneNumberId}/contacts/${waId}`, {
      body,
      responseType: "json"
    });
  }
}
