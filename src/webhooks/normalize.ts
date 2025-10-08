import { toCamelCaseDeep } from "../utils/case";
import type { KapsoMessageExtensions, MetaMessage, UnifiedMessage } from "../types";

export interface MessageStatusUpdate {
  id: string;
  status: string;
  timestamp?: string;
  recipientId?: string;
  conversation?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  errors?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface NormalizedCallEvent {
  event?: string;
  callId?: string;
  direction?: string;
  status?: string;
  from?: string;
  to?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface NormalizedWebhookResult {
  object?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  contacts: Array<Record<string, unknown>>;
  messages: UnifiedMessage[];
  statuses: MessageStatusUpdate[];
  calls: NormalizedCallEvent[];
  raw: Record<string, Array<Record<string, unknown>>>;
}

interface RawEntry {
  changes?: Array<{ value?: unknown }>;
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
          result.contacts.push(toCamelCaseDeep(contact));
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
        const normalizedCall = toCamelCaseDeep(call) as NormalizedCallEvent & { wacid?: string };
        if (typeof normalizedCall.wacid === "string" && !normalizedCall.callId) {
          normalizedCall.callId = normalizedCall.wacid;
          delete normalizedCall.wacid;
        }
        result.calls.push(normalizedCall);
      }
    }
  }

  return result;
}

function normalizeMessage(message: MetaMessage): UnifiedMessage {
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
