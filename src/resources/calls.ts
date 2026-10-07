import { z } from "zod";
import type { RecipientAddress } from "./messages/base";
import type { WhatsAppClient } from "../client";
import { assertKapsoProxy } from "./shared";
import type {
  CallArtifactKind,
  CallDetailsResponse,
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

const captureFields = {
  purpose: z.string().min(1).max(250),
  announcementLanguage: z.string().min(1)
};

const captureSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ENABLED"), ...captureFields }),
  z.object({
    status: z.literal("DISABLED"),
    purpose: captureFields.purpose.optional(),
    announcementLanguage: captureFields.announcementLanguage.optional()
  })
]);

/** Native capture is opt-in on connect/accept, never preAccept. @category Calls */
export type CallCaptureOptions = z.infer<typeof captureSchema>;

/** Select exactly one permission identity. @category Calls */
export type CallPermissionsInput = { phoneNumberId: string } & (
  | { userWaId: string; recipient?: never }
  | { recipient: string; userWaId?: never }
);

const connectSchema = z.object({
  phoneNumberId: z.string().min(1),
  /** Callee phone number. Optional since BSUIDs; provide this, recipient, or both. */
  to: z.string().min(1).optional(),
  /** Callee business-scoped user ID (BSUID). The phone number wins when both are present. */
  recipient: z.string().min(1).optional(),
  session: sessionSchema.optional(),
  bizOpaqueCallbackData: z.string().max(512).optional(),
  recording: captureSchema.optional(),
  transcription: captureSchema.optional()
});

const callIdSchema = z.object({
  phoneNumberId: z.string().min(1),
  callId: z.string().min(1)
});

const preAcceptSchema = callIdSchema.extend({
  session: sessionSchema
});

const acceptSchema = preAcceptSchema.extend({
  bizOpaqueCallbackData: z.string().max(512).optional(),
  recording: captureSchema.optional(),
  transcription: captureSchema.optional()
});

const permissionsSchema = z.object({
  phoneNumberId: z.string().min(1),
  userWaId: z.string().min(1).optional(),
  recipient: z.string().min(1).optional()
}).refine(input => (input.userWaId !== undefined) !== (input.recipient !== undefined), {
  message: "Provide exactly one of userWaId (phone) or recipient (BSUID)."
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
  constructor(private readonly client: WhatsAppClient) {}

  async connect(input: z.infer<typeof connectSchema> & RecipientAddress): Promise<CallConnectResponse> {
    const { phoneNumberId, to, recipient, session, bizOpaqueCallbackData, recording, transcription } =
      connectSchema.parse(input);

    if (!to && !recipient) {
      throw new Error(
        "Provide to (a phone number), recipient (a business-scoped user ID), or both."
      );
    }

    const body: Record<string, unknown> = {
      messagingProduct: "whatsapp",
      ...(to !== undefined ? { to } : {}),
      ...(recipient !== undefined ? { recipient } : {}),
      action: "connect"
    };
    if (session) body.session = session;
    if (bizOpaqueCallbackData) body.bizOpaqueCallbackData = bizOpaqueCallbackData;
    if (recording) body.recording = recording;
    if (transcription) body.transcription = transcription;

    return this.client.request<CallConnectResponse>("POST", `${phoneNumberId}/calls`, {
      body,
      responseType: "json"
    });
  }

  async preAccept(input: z.infer<typeof preAcceptSchema>): Promise<CallActionResponse> {
    if ("recording" in input || "transcription" in input) {
      throw new Error("Capture options apply to connect/accept only, not preAccept.");
    }
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
    const { phoneNumberId, callId, session, bizOpaqueCallbackData, recording, transcription } = acceptSchema.parse(input);
    const body: Record<string, unknown> = {
      messagingProduct: "whatsapp",
      callId,
      action: "accept",
      session
    };
    if (bizOpaqueCallbackData) body.bizOpaqueCallbackData = bizOpaqueCallbackData;
    if (recording) body.recording = recording;
    if (transcription) body.transcription = transcription;
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
    get: async (input: CallPermissionsInput): Promise<CallPermissionsResponse> => {
      const parsed = permissionsSchema.parse(input);
      return this.client.request<CallPermissionsResponse>("GET", `${parsed.phoneNumberId}/call_permissions`, {
        query: { userWaId: parsed.userWaId, recipient: parsed.recipient },
        responseType: "json"
      });
    }
  };

  /** Fetch camelized detail and artifact availability by Kapso's local UUID. @category Calls */
  async details(input: { callUuid: string }): Promise<CallDetailsResponse> {
    return this.client.requestKapsoCall<CallDetailsResponse>({ callUuid: input.callUuid }, "json");
  }

  /**
   * Fetch audio, transcript preview JSON, or original bytes (download=true).
   * Returns an unconsumed Response for streaming. No webhook/CDN URL is followed.
   * @category Calls
   */
  async fetchArtifact(input: { callUuid: string; kind: CallArtifactKind; download?: boolean }): Promise<Response> {
    return this.client.requestKapsoCall({ callUuid: input.callUuid, artifact: { kind: input.kind, download: input.download } });
  }

  async list(input: z.infer<typeof listSchema>): Promise<CallListResponse> {
    assertKapsoProxy(this.client, "Calls history API");
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
    assertKapsoProxy(this.client, "Calls history API");
    const { phoneNumberId, callId } = getCallSchema.parse(input);
    const response = await this.list({ phoneNumberId, callId, limit: 1 });
    return response.data[0];
  }
}
