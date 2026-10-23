import { isPlainObject, toCamelCaseDeep } from "../utils/case";
import { isBusinessScopedUserId } from "../utils/bsuid";
import type { KapsoMessageExtensions, MessageStatusUpdate, MetaMessage, UnifiedMessage } from "../types";
import { normalizeMessage } from "./normalize";
import type { NormalizedWebhookContact, NormalizedWebhookResult } from "./normalize";

/**
 * Header names Kapso sets on webhook deliveries, lowercased.
 * @category Webhooks
 */
export const KAPSO_WEBHOOK_HEADERS = {
  /** Event name, for example `whatsapp.message.received`. */
  event: "x-webhook-event",
  /** Hex HMAC-SHA256 of the raw body; verify with `verifyKapsoWebhookSignature`. */
  signature: "x-webhook-signature",
  /** Unique per delivery. Dedupe on this, not on `message.id`: delivered, read and failed share the message id. */
  idempotencyKey: "x-idempotency-key",
  /** `"true"` when the body is a batch envelope. */
  batch: "x-webhook-batch",
  /** Number of items in a batch envelope. */
  batchSize: "x-batch-size",
  /** Payload version, `v2` for current webhooks. */
  payloadVersion: "x-webhook-payload-version"
} as const;

/**
 * Event names Kapso delivers to phone-number webhooks. Unknown names are
 * preserved as strings so new events never break parsing.
 * @category Webhooks
 */
export type KapsoWebhookEventName =
  | "whatsapp.message.received"
  | "whatsapp.message.sent"
  | "whatsapp.message.delivered"
  | "whatsapp.message.read"
  | "whatsapp.message.failed"
  | "whatsapp.conversation.created"
  | "whatsapp.conversation.ended"
  | "whatsapp.conversation.inactive"
  | "whatsapp.contact.identity_changed"
  | "whatsapp.contact.marketing_preference_changed"
  | "whatsapp.thread.ownership_changed"
  | "whatsapp.thread.standby"
  | (string & {});

/**
 * Anything that holds request headers: a Fetch `Headers` instance (Hono,
 * Workers, Next.js) or a plain record such as Express/Node `req.headers`.
 * Lookups are case-insensitive either way.
 * @category Webhooks
 */
export type WebhookHeadersLike =
  | Headers
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | undefined | null>;

/** Typed view of the Kapso webhook headers. @category Webhooks */
export interface KapsoWebhookHeaders {
  event?: KapsoWebhookEventName;
  idempotencyKey?: string;
  signature?: string;
  batch: boolean;
  batchSize?: number;
  payloadVersion?: string;
}

/**
 * Conversation object attached to Kapso webhook events, camelCased.
 * `contactName` and `phoneNumber` live here; `kapso` holds summary metrics only.
 * @category Webhooks
 */
export interface KapsoWebhookConversation {
  id: string;
  /** Customer phone number. Absent for contacts known only by their BSUID. */
  phoneNumber?: string | null;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  contactName?: string | null;
  /** Customer business-scoped user ID (BSUID), when known. */
  businessScopedUserId?: string | null;
  parentBusinessScopedUserId?: string | null;
  username?: string | null;
  status?: string;
  lastActiveAt?: string;
  metadata?: Record<string, unknown>;
  kapso?: Record<string, unknown>;
  [key: string]: unknown;
}

/** `batch_info` of a buffered delivery, camelCased. @category Webhooks */
export interface KapsoWebhookBatchInfo {
  size?: number;
  windowMs?: number;
  firstSequence?: number;
  lastSequence?: number;
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * One delivery item, typed by the fields Kapso documents per event. Fields not
 * relevant to the event are simply absent. `raw` is the whole item, camelCased.
 * @category Webhooks
 */
export interface KapsoWebhookEvent {
  event?: KapsoWebhookEventName;
  phoneNumberId?: string;
  /** Present on message and thread.standby events. Same shape as `messages.query()` results. */
  message?: UnifiedMessage;
  conversation?: KapsoWebhookConversation;
  isNewConversation?: boolean;
  /** `whatsapp.contact.*`: the contact after the change. */
  contact?: Record<string, unknown>;
  /** `whatsapp.contact.identity_changed`: the BSUIDs Meta reported before the change. */
  previous?: { businessScopedUserId?: string | null; parentBusinessScopedUserId?: string | null; [key: string]: unknown };
  /** `whatsapp.contact.marketing_preference_changed`. Order deliveries by `sequence`, not by `occurredAt`. */
  marketingPreference?: { status?: string; previousStatus?: string; detail?: unknown; occurredAt?: string; sequence?: number; [key: string]: unknown };
  /** `whatsapp.thread.ownership_changed`. */
  thread?: Record<string, unknown>;
  /** `whatsapp.thread.standby`. */
  standby?: { kind?: string; [key: string]: unknown };
  /** `whatsapp.conversation.inactive`: the message the inactivity window is measured from. */
  sinceMessage?: { id?: string; whatsappMessageId?: string; direction?: string; createdAt?: string; [key: string]: unknown };
  /** `whatsapp.conversation.inactive`. */
  inactivity?: { minutes?: number; [key: string]: unknown };
  raw: Record<string, unknown>;
}

/**
 * Result of {@link normalizeKapsoWebhook}. Extends the `normalizeWebhook`
 * result so one handler can serve Meta-format and Kapso-format webhooks.
 * @category Webhooks
 */
export interface NormalizedKapsoWebhookResult extends NormalizedWebhookResult {
  /** From `X-Webhook-Event`, else the batch envelope's `type`. */
  event?: KapsoWebhookEventName;
  /** From `X-Idempotency-Key`. Persist it to skip redeliveries. */
  idempotencyKey?: string;
  payloadVersion?: string;
  /** True for batch envelopes. With buffering on, even a single message arrives batched. */
  batch: boolean;
  batchInfo?: KapsoWebhookBatchInfo;
  /** One entry per delivery item, in delivery order. */
  events: KapsoWebhookEvent[];
  /** Distinct conversations referenced by this delivery. */
  conversations: KapsoWebhookConversation[];
}

/** Options for {@link normalizeKapsoWebhook}. @category Webhooks */
export interface NormalizeKapsoWebhookOptions {
  /** Request headers. Supplies the event name, idempotency key and batch flag. */
  headers?: WebhookHeadersLike;
  /** Used when neither the payload nor the conversation carries a phone number ID. */
  defaultPhoneNumberId?: string;
}

const STATUS_EVENT_SUFFIXES = new Set(["sent", "delivered", "read", "failed"]);
const MESSAGE_EVENT_PREFIX = "whatsapp.message.";

/**
 * Read the Kapso webhook headers from a Fetch `Headers` instance or a header record.
 * @category Webhooks
 */
export function readKapsoWebhookHeaders(headers: WebhookHeadersLike): KapsoWebhookHeaders {
  const event = getHeader(headers, KAPSO_WEBHOOK_HEADERS.event);
  const batchSize = getHeader(headers, KAPSO_WEBHOOK_HEADERS.batchSize);
  const parsedSize = batchSize !== undefined ? Number.parseInt(batchSize, 10) : NaN;
  return {
    event: event ? (event as KapsoWebhookEventName) : undefined,
    idempotencyKey: getHeader(headers, KAPSO_WEBHOOK_HEADERS.idempotencyKey),
    signature: getHeader(headers, KAPSO_WEBHOOK_HEADERS.signature),
    batch: (getHeader(headers, KAPSO_WEBHOOK_HEADERS.batch) ?? "").toLowerCase() === "true",
    batchSize: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined,
    payloadVersion: getHeader(headers, KAPSO_WEBHOOK_HEADERS.payloadVersion)
  };
}

/**
 * True when the body looks like a Kapso-format webhook (single event or batch
 * envelope) rather than a Meta Graph payload. Useful when one route receives
 * both webhook kinds.
 * @category Webhooks
 */
export function isKapsoWebhookPayload(payload: unknown): boolean {
  if (!isPlainObject(payload)) return false;
  if (Array.isArray(payload.entry)) return false;
  if (payload.batch === true) return true;
  return ["message", "conversation", "contact", "thread"].some((key) => isPlainObject(payload[key]));
}

/**
 * Normalize a Kapso-format webhook delivery (payload v2), single event or
 * batch envelope, into the same `{ messages, statuses, contacts, raw }` shape
 * that `normalizeWebhook` produces for Meta payloads, plus Kapso extras.
 *
 * - `messages` holds inbound messages (`whatsapp.message.received`, `whatsapp.thread.standby`).
 *   Outbound echoes stay in `events[].message` and out of `messages`.
 * - `statuses` is derived from `whatsapp.message.sent|delivered|read|failed`
 *   using `message.kapso.statuses`, so `pricing` and `errors` are preserved.
 * - Never throws on unexpected input; unknown shapes produce empty lists.
 *
 * Pass the request headers so the event name and idempotency key are picked up.
 * Verify the signature with `verifyKapsoWebhookSignature` before calling this.
 * @category Webhooks
 */
export function normalizeKapsoWebhook(
  payload: unknown,
  options: NormalizeKapsoWebhookOptions = {}
): NormalizedKapsoWebhookResult {
  const headers = options.headers ? readKapsoWebhookHeaders(options.headers) : undefined;
  const result: NormalizedKapsoWebhookResult = {
    object: undefined,
    phoneNumberId: options.defaultPhoneNumberId,
    displayPhoneNumber: undefined,
    contacts: [],
    messages: [],
    statuses: [],
    calls: [],
    raw: {},
    event: headers?.event,
    idempotencyKey: headers?.idempotencyKey,
    payloadVersion: headers?.payloadVersion,
    batch: headers?.batch ?? false,
    batchInfo: undefined,
    events: [],
    conversations: []
  };

  if (!isPlainObject(payload) || !isKapsoWebhookPayload(payload)) {
    return result;
  }

  const envelopeEvent = readString(payload.type) ?? readString(payload.event);
  const eventName = (headers?.event ?? envelopeEvent) as KapsoWebhookEventName | undefined;
  result.event = eventName;

  const isBatch = payload.batch === true || (Array.isArray(payload.data) && !isPlainObject(payload.message));
  let items: Record<string, unknown>[];
  if (isBatch) {
    result.batch = true;
    items = Array.isArray(payload.data) ? payload.data.filter(isPlainObject) : [];
    if (isPlainObject(payload.batch_info) || isPlainObject(payload.batchInfo)) {
      result.batchInfo = toCamelCaseDeep(payload.batch_info ?? payload.batchInfo) as KapsoWebhookBatchInfo;
    }
  } else {
    items = [payload];
  }

  const seenConversations = new Set<string>();
  const seenContacts = new Set<string>();

  for (const item of items) {
    const value = toCamelCaseDeep(item) as Record<string, unknown>;
    const event: KapsoWebhookEvent = { event: eventName, raw: value };

    const conversation = isPlainObject(value.conversation) ? (value.conversation as KapsoWebhookConversation) : undefined;
    if (conversation) {
      event.conversation = conversation;
      const key = readString(conversation.id) ?? JSON.stringify(conversation);
      if (!seenConversations.has(key)) {
        seenConversations.add(key);
        result.conversations.push(conversation);
      }
      if (!result.displayPhoneNumber && readString(conversation.displayPhoneNumber)) {
        result.displayPhoneNumber = readString(conversation.displayPhoneNumber);
      }
    }

    if (typeof value.isNewConversation === "boolean") event.isNewConversation = value.isNewConversation;
    copyObject(value, event, "contact");
    copyObject(value, event, "previous");
    copyObject(value, event, "marketingPreference");
    copyObject(value, event, "thread");
    copyObject(value, event, "standby");
    copyObject(value, event, "sinceMessage");
    copyObject(value, event, "inactivity");

    const message = isPlainObject(item.message) ? normalizeMessage(item.message as unknown as MetaMessage) : undefined;
    const kapso = message?.kapso;

    const phoneNumberId =
      readString(value.phoneNumberId) ??
      readString(conversation?.phoneNumberId) ??
      readString(kapso?.phoneNumberId) ??
      options.defaultPhoneNumberId;
    if (phoneNumberId) {
      event.phoneNumberId = phoneNumberId;
      result.phoneNumberId = phoneNumberId;
    }

    if (message) {
      hydrateMessage(message, conversation, phoneNumberId, eventName);
      event.message = message;

      const statusName = statusForEvent(eventName, message);
      if (statusName) {
        result.statuses.push(buildStatus(message, conversation, statusName));
      } else if (message.kapso?.direction === "inbound") {
        result.messages.push(message);
      }
    }

    const contact = buildContact(message, conversation, isPlainObject(value.contact) ? value.contact : undefined);
    if (contact) {
      const key = `${contact.waId ?? ""}|${contact.userId ?? ""}`;
      if (!seenContacts.has(key)) {
        seenContacts.add(key);
        result.contacts.push(contact);
      }
    }

    const rawKey = eventName ?? "unknown";
    const list = result.raw[rawKey] ?? [];
    list.push(value);
    result.raw[rawKey] = list;

    result.events.push(event);
  }

  return result;
}

/**
 * The customer's address on a webhook message, ready to spread into a send:
 * `{ to }` when a phone number is known, `{ recipient }` when the customer is
 * identified only by a business-scoped user ID, both when both are present.
 * Inbound messages use `from` / `fromUserId`; outbound echoes use `to` / `toUserId`.
 * Returns `undefined` when the message carries neither.
 * @category Webhooks
 */
export function getKapsoSender(message: UnifiedMessage): { to?: string; recipient?: string } | undefined {
  const outbound = message.kapso?.direction === "outbound";
  const phone = readString(outbound ? message.to : message.from);
  const userId = readString(outbound ? message.toUserId : message.fromUserId);
  const address: { to?: string; recipient?: string } = {};
  if (phone) address.to = phone;
  if (userId && isBusinessScopedUserId(userId)) address.recipient = userId;
  return address.to || address.recipient ? address : undefined;
}

function hydrateMessage(
  message: UnifiedMessage,
  conversation: KapsoWebhookConversation | undefined,
  phoneNumberId: string | undefined,
  eventName: KapsoWebhookEventName | undefined
): void {
  const kapso: KapsoMessageExtensions = message.kapso ?? {};
  message.kapso = kapso;

  if (!kapso.direction) {
    kapso.direction = inferDirection(eventName, message);
  }
  if (!kapso.phoneNumberId && phoneNumberId) {
    kapso.phoneNumberId = phoneNumberId;
  }
  if (!kapso.whatsappConversationId && readString(conversation?.id)) {
    kapso.whatsappConversationId = conversation!.id;
  }
  const contactName = readString(conversation?.contactName) ?? readString(conversation?.kapso?.contactName);
  if (!kapso.contactName && contactName) {
    kapso.contactName = contactName;
  }
}

function inferDirection(eventName: KapsoWebhookEventName | undefined, message: UnifiedMessage): "inbound" | "outbound" | undefined {
  const suffix = messageEventSuffix(eventName);
  if (suffix === "received") return "inbound";
  if (suffix && STATUS_EVENT_SUFFIXES.has(suffix)) return "outbound";
  if (eventName === "whatsapp.thread.standby") return "inbound";
  if (eventName === undefined) {
    if (readString(message.from) || readString(message.fromUserId)) return "inbound";
    if (readString(message.to) || readString(message.toUserId)) return "outbound";
  }
  return undefined;
}

function statusForEvent(eventName: KapsoWebhookEventName | undefined, message: UnifiedMessage): string | undefined {
  const suffix = messageEventSuffix(eventName);
  if (suffix && STATUS_EVENT_SUFFIXES.has(suffix)) return suffix;
  if (suffix) return undefined;
  // No event name: an outbound message whose Kapso status is a delivery state is a status update.
  if (eventName === undefined && message.kapso?.direction === "outbound") {
    const status = readString(message.kapso.status);
    if (status && STATUS_EVENT_SUFFIXES.has(status)) return status;
  }
  return undefined;
}

function messageEventSuffix(eventName: KapsoWebhookEventName | undefined): string | undefined {
  if (!eventName || !eventName.startsWith(MESSAGE_EVENT_PREFIX)) return undefined;
  return eventName.slice(MESSAGE_EVENT_PREFIX.length);
}

function buildStatus(
  message: UnifiedMessage,
  conversation: KapsoWebhookConversation | undefined,
  status: string
): MessageStatusUpdate {
  const history = Array.isArray(message.kapso?.statuses) ? message.kapso.statuses : [];
  let entry: MessageStatusUpdate | undefined;
  for (const candidate of history) {
    if (isPlainObject(candidate) && candidate.status === status) entry = candidate;
  }
  const recipientId = readString(entry?.recipientId) ?? digits(readString(message.to) ?? readString(conversation?.phoneNumber));
  const recipientUserId = readString(entry?.recipientUserId) ?? readString(message.toUserId) ?? readString(conversation?.businessScopedUserId);
  return {
    ...(entry ?? {}),
    id: readString(entry?.id) ?? message.id,
    status,
    timestamp: readString(entry?.timestamp) ?? readString(message.timestamp),
    ...(recipientId ? { recipientId } : {}),
    ...(recipientUserId ? { recipientUserId } : {})
  };
}

function buildContact(
  message: UnifiedMessage | undefined,
  conversation: KapsoWebhookConversation | undefined,
  contactRecord: Record<string, unknown> | undefined
): NormalizedWebhookContact | undefined {
  const inbound = message?.kapso?.direction !== "outbound";
  const waId = digits(
    readString(contactRecord?.waId) ??
      readString(conversation?.phoneNumber) ??
      readString(inbound ? message?.from : message?.to)
  );
  const userId =
    readString(contactRecord?.businessScopedUserId) ??
    readString(inbound ? message?.fromUserId : message?.toUserId) ??
    readString(conversation?.businessScopedUserId);
  if (!waId && !userId) return undefined;

  const parentUserId =
    readString(contactRecord?.parentBusinessScopedUserId) ??
    readString(inbound ? message?.fromParentUserId : message?.toParentUserId) ??
    readString(conversation?.parentBusinessScopedUserId);
  const name =
    readString(contactRecord?.displayName) ??
    readString(contactRecord?.profileName) ??
    readString(conversation?.contactName) ??
    readString(conversation?.kapso?.contactName) ??
    readString(message?.kapso?.contactName);
  const username = readString(contactRecord?.username) ?? readString(message?.username) ?? readString(conversation?.username);

  const contact: NormalizedWebhookContact = {};
  if (waId) contact.waId = waId;
  if (userId) contact.userId = userId;
  if (parentUserId) contact.parentUserId = parentUserId;
  if (name || username) {
    contact.profile = { ...(name ? { name } : {}), ...(username ? { username } : {}) };
  }
  return contact;
}

function copyObject(source: Record<string, unknown>, target: KapsoWebhookEvent, key: keyof KapsoWebhookEvent & string): void {
  if (isPlainObject(source[key])) {
    (target as unknown as Record<string, unknown>)[key] = source[key];
  }
}

function getHeader(headers: WebhookHeadersLike, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get(name: string): string | null | undefined }).get(name);
    return typeof value === "string" && value.length > 0 ? value.trim() : undefined;
  }
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.length > 0) return first.trim();
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function digits(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}
