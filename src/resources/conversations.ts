import { z } from "zod";
import type { WhatsAppClient } from "../client";
import type { ConversationListResponse, ConversationRecord, GraphSuccessResponse } from "../types";

const listSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    status: z.string().min(1).optional(),
    lastActiveSince: z.string().min(1).optional(),
    lastActiveUntil: z.string().min(1).optional(),
    phoneNumber: z.string().min(1).optional(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional()
  })
  .passthrough();

const getSchema = z.object({ conversationId: z.string().min(1) });

const updateStatusSchema = z.object({
  conversationId: z.string().min(1),
  status: z.string().min(1)
});

function cleanQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined));
}

/**
 * Conversations history and lifecycle helpers.
 * @category Conversations
 */
export class ConversationsResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async list(input: z.infer<typeof listSchema>): Promise<ConversationListResponse> {
    const { phoneNumberId, ...rest } = listSchema.parse(input);
    const query = cleanQuery(rest);
    return this.client.request<ConversationListResponse>("GET", `${phoneNumberId}/conversations`, {
      query,
      responseType: "json"
    });
  }

  async get(input: z.infer<typeof getSchema>): Promise<ConversationRecord> {
    const { conversationId } = getSchema.parse(input);
    const response = await this.client.request<ConversationRecord | { data: ConversationRecord }>(
      "GET",
      `conversations/${conversationId}`,
      { responseType: "json" }
    );

    if (response && typeof response === "object" && "data" in response) {
      return (response as { data: ConversationRecord }).data;
    }

    return response as ConversationRecord;
  }

  async updateStatus(input: z.infer<typeof updateStatusSchema>): Promise<GraphSuccessResponse> {
    const { conversationId, status } = updateStatusSchema.parse(input);
    return this.client.request<GraphSuccessResponse>("PATCH", `conversations/${conversationId}`, {
      body: { status },
      responseType: "json"
    });
  }
}
