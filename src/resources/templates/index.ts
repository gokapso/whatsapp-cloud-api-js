import { z } from "zod";
import type { WhatsAppClient } from "../../client";
import type {
  TemplateCreateResponse,
  TemplateDeleteResponse,
  TemplateListResponse
} from "../../types";

const listSchema = z.object({
  businessAccountId: z.string().min(1, "businessAccountId is required"),
  before: z.string().optional(),
  after: z.string().optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(["ASC", "DESC"]).optional(),
  status: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  language: z.string().optional()
});

const componentSchema = z.object({
  type: z.string().min(1)
}).loose();

const createSchema = z.object({
  businessAccountId: z.string().min(1, "businessAccountId is required"),
  name: z.string().min(1, "name is required"),
  language: z.string().min(1, "language is required"),
  category: z.string().min(1, "category is required"),
  allowCategoryChange: z.boolean().optional(),
  components: z.array(componentSchema).nonempty(),
  qualityScoreCategory: z.string().optional()
});

const deleteSchema = z.object({
  businessAccountId: z.string().min(1, "businessAccountId is required"),
  name: z.string().min(1, "name is required"),
  language: z.string().optional()
});

type ListInput = z.infer<typeof listSchema>;
type CreateInput = z.infer<typeof createSchema>;
type DeleteInput = z.infer<typeof deleteSchema>;

/**
 * CRUD for message templates on a WhatsApp Business Account (WABA).
 * @category Templates
 */
export class TemplatesResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async list(input: ListInput): Promise<TemplateListResponse> {
    const parsed = listSchema.parse(input);
    const { businessAccountId, ...query } = parsed;

    return this.client.request<TemplateListResponse>("GET", `${businessAccountId}/message_templates`, {
      query: removeUndefined(query),
      responseType: "json"
    });
  }

  async create(input: CreateInput): Promise<TemplateCreateResponse> {
    const parsed = createSchema.parse(input);
    const { businessAccountId, ...body } = parsed;

    return this.client.request<TemplateCreateResponse>("POST", `${businessAccountId}/message_templates`, {
      body,
      responseType: "json"
    });
  }

  async delete(input: DeleteInput): Promise<TemplateDeleteResponse> {
    const parsed = deleteSchema.parse(input);
    const { businessAccountId, ...query } = parsed;

    return this.client.request<TemplateDeleteResponse>("DELETE", `${businessAccountId}/message_templates`, {
      query: removeUndefined(query),
      responseType: "json"
    });
  }
}

function removeUndefined<T extends Record<string, unknown>>(input: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result as T;
}
