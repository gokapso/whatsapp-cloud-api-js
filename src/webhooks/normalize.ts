import { toCamelCaseDeep } from "../utils/case";
import type { CallArtifactKind, KapsoMessageExtensions, MessageStatusUpdate, MetaMessage, UnifiedMessage } from "../types";

export type { MessageStatusUpdate } from "../types";

/**
 * A webhook contact entry, camelized. Either waId or userId can be absent:
 * a contact can arrive identified only by its business-scoped user ID.
 */
export interface NormalizedWebhookContact {
  waId?: string;
  /** Business-scoped user ID (BSUID). */
  userId?: string;
  /** Parent BSUID; only for businesses enrolled in parent BSUIDs. */
  parentUserId?: string;
  profile?: { name?: string; username?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Media metadata in a native call completion webhook. @category Webhooks */
export type CallArtifactMedia = {
  id: string;
  sha256?: string;
  mimeType?: string;
  url?: string;
};

export interface NormalizedCallEvent {
  /** Original Meta id, preserved alongside the callId alias. */
  id?: string;
  /** Legacy identifier, preserved when supplied. */
  wacid?: string;
  callRecording?: { type?: string; audio?: CallArtifactMedia };
  callTranscript?: { document?: CallArtifactMedia };
  event?: string;
  callId?: string;
  direction?: string;
  status?: string;
  from?: string;
  to?: string;
  /** Caller business-scoped user ID (BSUID). */
  fromUserId?: string;
  fromParentUserId?: string;
  /** Callee business-scoped user ID (BSUID). */
  toUserId?: string;
  toParentUserId?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  /**
   * payload from the call button (interactive or template) the user tapped.
   * Meta sends it on connect and terminate events; clients need WhatsApp 2.25.27+.
   * Distinct from bizOpaqueCallbackData.
   */
  ctaPayload?: string;
  /** biz_payload from the calling deep link the user opened; same events and client version as ctaPayload. */
  deeplinkPayload?: string;
  [key: string]: unknown;
}

export interface NormalizedWebhookResult {
  object?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  contacts: NormalizedWebhookContact[];
  messages: UnifiedMessage[];
  statuses: MessageStatusUpdate[];
  calls: NormalizedCallEvent[];
  raw: Record<string, Array<Record<string, unknown>>>;
}

interface RawEntry {
  changes?: Array<{ value?: unknown; field?: unknown }>;
  [key: string]: unknown;
}

interface RawPayload {
  object?: string;
  entry?: RawEntry[];
  [key: string]: unknown;
}

export function normalizeWebhook(payload: unknown): NormalizedWebhookResult {
  const result: NormalizedWebhookResult = {
    object: undefined,
    phoneNumberId: undefined,
    displayPhoneNumber: undefined,
    contacts: [],
    messages: [],
    statuses: [],
    calls: [],
    raw: {}
  };

  if (!payload || typeof payload !== "object") {
    return result;
  }

  const top = payload as RawPayload;
  if (typeof top.object === "string") {
    result.object = top.object;
  }

  const entries = Array.isArray(top.entry) ? top.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const rawValue = change?.value;
      if (!rawValue || typeof rawValue !== "object") {
        continue;
      }

      const value = toCamelCaseDeep(rawValue) as Record<string, unknown>;
      const fieldKey = toCamelField(change?.field);
      if (fieldKey) {
        const list = result.raw[fieldKey] ?? [];
        list.push(value as Record<string, unknown>);
        result.raw[fieldKey] = list;
      }

      const metadata = (value.metadata ?? {}) as Record<string, unknown>;

      if (typeof metadata.phoneNumberId === "string") {
        result.phoneNumberId = metadata.phoneNumberId;
      }
      if (typeof metadata.displayPhoneNumber === "string") {
        result.displayPhoneNumber = metadata.displayPhoneNumber;
      }

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      if (contacts.length > 0) {
        for (const contact of contacts) {
          result.contacts.push(toCamelCaseDeep(contact) as NormalizedWebhookContact);
        }
      }

      const messages = Array.isArray(value.messages) ? value.messages : [];
      const messageEchoes = Array.isArray(value.messageEchoes) ? value.messageEchoes : [];
      for (const message of [...messages, ...messageEchoes]) {
        const normalized = normalizeMessage(message as MetaMessage);
        applyDirection(normalized, metadata, messageEchoes.includes(message));
        result.messages.push(normalized);
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const normalizedStatus = toCamelCaseDeep(status) as MessageStatusUpdate;
        result.statuses.push(normalizedStatus);
      }

      const calls = Array.isArray(value.calls) ? value.calls : [];
      for (const call of calls) {
        const normalizedCall = toCamelCaseDeep(call) as NormalizedCallEvent;
        if (!normalizedCall.callId) {
          if (typeof normalizedCall.wacid === "string") {
            normalizedCall.callId = normalizedCall.wacid;
          } else if (typeof normalizedCall.id === "string") {
            normalizedCall.callId = normalizedCall.id;
          }
        }
        result.calls.push(normalizedCall);
      }
    }
  }

  return result;
}

/**
 * CamelCase one Meta message and hydrate Kapso extras (Flow responses, order text).
 * Shared by the Meta and Kapso webhook normalizers.
 * @internal
 */
/** The option a user tapped, whichever message shape WhatsApp used to deliver it. */
export interface TappedOption {
  /** The `id` of a reply button or list row, or the `payload` of a template or carousel quick reply. */
  id: string;
  /** The label the user saw. */
  title: string;
  /** Only for list rows. */
  description?: string;
  /** Where the tap came from. */
  source: "button_reply" | "list_reply" | "button";
}

/**
 * Returns the option a user tapped, or undefined when the message is not a tap.
 *
 * WhatsApp delivers taps in three shapes: reply buttons as
 * `interactive.button_reply`, list rows as `interactive.list_reply`, and quick
 * replies on templates and on free-form carousel cards as a top-level
 * `type: "button"` message with `button.text` and `button.payload`. Handlers
 * that only check `interactive` miss the third one. Works on messages from
 * `normalizeWebhook`, `normalizeKapsoWebhook` and `messages.query`; it also
 * reads raw snake_case keys so a not yet normalized webhook message works too.
 */
export function getTappedOption(message: MetaMessage | null | undefined): TappedOption | undefined {
  if (!message || typeof message !== "object") return undefined;

  const interactive = message.interactive as Record<string, unknown> | undefined;
  if (interactive && typeof interactive === "object") {
    const buttonReply = pick(interactive, "buttonReply", "button_reply");
    if (buttonReply) {
      const id = readString(buttonReply.id);
      const title = readString(buttonReply.title);
      if (id !== undefined && title !== undefined) return { id, title, source: "button_reply" };
    }
    const listReply = pick(interactive, "listReply", "list_reply");
    if (listReply) {
      const id = readString(listReply.id);
      const title = readString(listReply.title);
      if (id !== undefined && title !== undefined) {
        const description = readString(listReply.description);
        return description !== undefined ? { id, title, description, source: "list_reply" } : { id, title, source: "list_reply" };
      }
    }
  }

  if (message.type === "button") {
    const button = (message.button && typeof message.button === "object" ? message.button : undefined) as Record<string, unknown> | undefined;
    const data = pick((message.kapso ?? {}) as Record<string, unknown>, "messageTypeData", "message_type_data");
    const id = readString(button?.payload) ?? readString(data?.payload);
    const title = readString(button?.text) ?? readString(data?.text);
    if (id !== undefined || title !== undefined) {
      return { id: id ?? title!, title: title ?? id!, source: "button" };
    }
  }

  return undefined;
}

function pick(source: Record<string, unknown>, camel: string, snake: string): Record<string, unknown> | undefined {
  const value = source[camel] ?? source[snake];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeMessage(message: MetaMessage): UnifiedMessage {
  const normalized = toCamelCaseDeep(message) as UnifiedMessage;

  if (normalized.order && typeof (normalized.order as Record<string, unknown>).text !== "undefined") {
    const orderRecord = normalized.order as Record<string, unknown> & { text?: unknown };
    const orderText = orderRecord.text;
    delete orderRecord.text;
    if (orderText !== undefined) {
      (orderRecord as Record<string, unknown>).orderText = orderText;
      ensureKapso(normalized).orderText = orderText as string;
    }
  }

  if (
    normalized.interactive?.type === "nfm_reply" &&
    normalized.interactive.nfmReply &&
    typeof (normalized.interactive.nfmReply as Record<string, unknown>).responseJson === "string"
  ) {
    const nfm = normalized.interactive.nfmReply as Record<string, unknown> & { responseJson?: string; name?: string };
    const responseJson = nfm.responseJson;
    if (typeof responseJson === "string" && responseJson.trim()) {
      try {
        const parsed = JSON.parse(responseJson);
        const camel = toCamelCaseDeep(parsed) as Record<string, unknown>;
        const kapso = ensureKapso(normalized);
        kapso.flowResponse = camel;
        if (typeof camel.flowToken === "string") {
          kapso.flowToken = camel.flowToken as string;
        }
        if (typeof nfm.name === "string") {
          kapso.flowName = nfm.name;
        }
      } catch {
        // ignore parse failure, keep original string
      }
    }
  }

  if (normalized.kapso && Object.keys(normalized.kapso).length === 0) {
    delete normalized.kapso;
  }

  return normalized;
}


function applyDirection(message: UnifiedMessage, metadata: Record<string, unknown>, isEcho: boolean): void {
  const businessCandidates: string[] = [];
  const phoneNumberId = typeof metadata.phoneNumberId === "string" ? metadata.phoneNumberId : undefined;
  const displayPhoneNumber = typeof metadata.displayPhoneNumber === "string" ? metadata.displayPhoneNumber : undefined;
  const contextFrom = typeof message.context?.from === "string" ? message.context.from : undefined;

  if (phoneNumberId) businessCandidates.push(phoneNumberId);
  if (displayPhoneNumber) businessCandidates.push(displayPhoneNumber);
  if (contextFrom) businessCandidates.push(contextFrom);

  const businessSet = new Set(businessCandidates.map(normalizeNumber));
  const fromNorm = typeof message.from === "string" ? normalizeNumber(message.from) : undefined;
  const toNorm = typeof message.to === "string" ? normalizeNumber(message.to) : undefined;

  let direction: "inbound" | "outbound" | undefined;
  if (isEcho) {
    direction = "outbound";
  } else if (fromNorm && businessSet.has(fromNorm)) {
    direction = "outbound";
  } else if (toNorm && businessSet.has(toNorm)) {
    direction = "inbound";
  } else if (contextFrom && businessSet.has(normalizeNumber(contextFrom))) {
    direction = "inbound";
  } else if (fromNorm) {
    direction = "inbound";
  } else if (typeof message.fromUserId === "string" && message.fromUserId.length > 0) {
    // A message can arrive with no phone number at all once the sender has a
    // username; the business-scoped user ID still identifies it as inbound.
    direction = "inbound";
  }

  if (direction || isEcho) {
    const kapso = ensureKapso(message);
    if (direction) {
      kapso.direction = direction;
    }
    if (isEcho) {
      kapso.source = "smb_message_echo";
    }
  }
}

function normalizeNumber(value?: string): string {
  if (!value) return "";
  return value.replace(/[^0-9]/g, "");
}

function ensureKapso(message: UnifiedMessage): KapsoMessageExtensions {
  if (!message.kapso) {
    message.kapso = {};
  }
  return message.kapso;
}

function toCamelField(field: unknown): string | undefined {
  if (typeof field !== "string" || !field.length) {
    return undefined;
  }
  return field.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/** Native call artifact completion event names, including both transcript spellings. @category Webhooks */
export type CallArtifactEventName = "call_recording_available" | "call_transcription_available" | "call_transcript_available";

/** Classify a completion without changing its original event name. @category Webhooks */
export function getCallArtifactKind(event: NormalizedCallEvent): CallArtifactKind | undefined {
  switch (event.event) {
    case "call_recording_available":
      return "recording";
    case "call_transcription_available":
    case "call_transcript_available":
      return "transcription";
    default:
      return undefined;
  }
}

/** Completion events arrive after a call; they must not start a call session. @category Webhooks */
export function isCallArtifactEvent(event: NormalizedCallEvent): event is NormalizedCallEvent & {
  event: CallArtifactEventName;
} {
  return getCallArtifactKind(event) !== undefined;
}
