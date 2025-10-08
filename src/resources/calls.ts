import { z } from "zod";
import type { WhatsAppClient } from "../client";
import type {
  CallActionResponse,
  CallConnectResponse,
  CallListResponse,
  CallPermissionsResponse,
  CallRecord
} from "../types";

const sessionSchema = z.object({
  sdpType: z.string().min(1),
  sdp: z.string().min(1)
});

const connectSchema = z.object({
  phoneNumberId: z.string().min(1),
  to: z.string().min(1),
  session: sessionSchema.optional(),
  bizOpaqueCallbackData: z.string().max(512).optional()
});

const callIdSchema = z.object({
  phoneNumberId: z.string().min(1),
  callId: z.string().min(1)
});

const preAcceptSchema = callIdSchema.extend({
  session: sessionSchema
});

const acceptSchema = preAcceptSchema.extend({
  bizOpaqueCallbackData: z.string().max(512).optional()
});

const permissionsSchema = z.object({
  phoneNumberId: z.string().min(1),
  userWaId: z.string().min(1)
});

const listSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    direction: z.string().optional(),
    status: z.string().optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    callId: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    after: z.string().optional(),
    before: z.string().optional(),
    fields: z.string().optional()
  })
  .passthrough();

const getCallSchema = z.object({
  phoneNumberId: z.string().min(1),
  callId: z.string().min(1)
});

/**
 * Calling API helpers: initiate/accept calls and manage permissions.
 * @category Calls
 */
export class CallsResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async connect(input: z.infer<typeof connectSchema>): Promise<CallConnectResponse> {
    const { phoneNumberId, to, session, bizOpaqueCallbackData } = connectSchema.parse(input);
    const body: Record<string, unknown> = {
      messagingProduct: "whatsapp",
      to,
      action: "connect"
    };
    if (session) body.session = session;
    if (bizOpaqueCallbackData) body.bizOpaqueCallbackData = bizOpaqueCallbackData;

    return this.client.request<CallConnectResponse>("POST", `${phoneNumberId}/calls`, {
      body,
      responseType: "json"
    });
  }

  async preAccept(input: z.infer<typeof preAcceptSchema>): Promise<CallActionResponse> {
    const { phoneNumberId, callId, session } = preAcceptSchema.parse(input);
    return this.client.request<CallActionResponse>("POST", `${phoneNumberId}/calls`, {
      body: {
        messagingProduct: "whatsapp",
        callId,
        action: "pre_accept",
        session
      },
      responseType: "json"
    });
  }

  async accept(input: z.infer<typeof acceptSchema>): Promise<CallActionResponse> {
    const { phoneNumberId, callId, session, bizOpaqueCallbackData } = acceptSchema.parse(input);
    const body: Record<string, unknown> = {
      messagingProduct: "whatsapp",
      callId,
      action: "accept",
      session
    };
    if (bizOpaqueCallbackData) body.bizOpaqueCallbackData = bizOpaqueCallbackData;
    return this.client.request<CallActionResponse>("POST", `${phoneNumberId}/calls`, {
      body,
      responseType: "json"
    });
  }

  async reject(input: z.infer<typeof callIdSchema>): Promise<CallActionResponse> {
    const { phoneNumberId, callId } = callIdSchema.parse(input);
    return this.client.request<CallActionResponse>("POST", `${phoneNumberId}/calls`, {
      body: {
        messagingProduct: "whatsapp",
        callId,
        action: "reject"
      },
      responseType: "json"
    });
  }

  async terminate(input: z.infer<typeof callIdSchema>): Promise<CallActionResponse> {
    const { phoneNumberId, callId } = callIdSchema.parse(input);
    return this.client.request<CallActionResponse>("POST", `${phoneNumberId}/calls`, {
      body: {
        messagingProduct: "whatsapp",
        callId,
        action: "terminate"
      },
      responseType: "json"
    });
  }

  readonly permissions = {
    get: async (input: z.infer<typeof permissionsSchema>): Promise<CallPermissionsResponse> => {
      const parsed = permissionsSchema.parse(input);
      return this.client.request<CallPermissionsResponse>("GET", `${parsed.phoneNumberId}/call_permissions`, {
        query: { userWaId: parsed.userWaId },
        responseType: "json"
      });
    }
  };

  async list(input: z.infer<typeof listSchema>): Promise<CallListResponse> {
    const { phoneNumberId, ...rest } = listSchema.parse(input);
    const query = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined && value !== null)
    );
    return this.client.request<CallListResponse>("GET", `${phoneNumberId}/calls`, {
      query,
      responseType: "json"
    });
  }

  async get(input: z.infer<typeof getCallSchema>): Promise<CallRecord | undefined> {
    const { phoneNumberId, callId } = getCallSchema.parse(input);
    const response = await this.list({ phoneNumberId, callId, limit: 1 });
    return response.data[0];
  }
}
