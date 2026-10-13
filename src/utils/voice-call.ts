/**
 * Meta limits for WhatsApp call buttons and calling deep links.
 * See https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-button-messages-deep-links/
 */
export const VOICE_CALL_DISPLAY_TEXT_MAX = 20;
export const VOICE_CALL_PAYLOAD_MAX = 512;
/** ttl_minutes on interactive sends and template sends (Meta default 10080). */
export const VOICE_CALL_SEND_TTL_MINUTES = { min: 1, max: 43200 } as const;
/** ttl_minutes on template creation. */
export const VOICE_CALL_TEMPLATE_TTL_MINUTES = { min: 1440, max: 43200 } as const;

export const CALL_DEEP_LINK_BASE_URL = "https://wa.me/call/";

export type CallDeepLinkInput = {
  /** Business phone number with voice calling enabled, e.g. "+1 (555) 010-0000". */
  phoneNumber: string;
  /** Tracking string sent as biz_payload; returned as deeplink_payload on call connect/terminate webhooks. */
  payload?: string;
};

const PHONE_SEPARATORS = /[\s().-]/g;

/**
 * Build a calling deep link (https://wa.me/call/<number>?biz_payload=<payload>).
 * Pure: it formats a URL and never calls an API or link shortener.
 * The payload is percent-encoded, so spaces, Unicode, "&", "?" and "#" survive.
 * @category Calls
 */
export function buildCallDeepLink(input: CallDeepLinkInput): string {
  const digits = normalizeBusinessPhoneNumber(input.phoneNumber);
  const base = `${CALL_DEEP_LINK_BASE_URL}${digits}`;

  if (input.payload === undefined) {
    return base;
  }
  if (typeof input.payload !== "string" || input.payload.length === 0) {
    throw new Error("Call deep link payload must be a non-empty string when provided.");
  }

  return `${base}?biz_payload=${encodeURIComponent(input.payload)}`;
}

function normalizeBusinessPhoneNumber(phoneNumber: string): string {
  if (typeof phoneNumber !== "string") {
    throw new Error("Call deep link phoneNumber must be a string.");
  }
  const digits = phoneNumber.trim().replace(/^\+/, "").replace(PHONE_SEPARATORS, "");
  // E.164 allows at most 15 digits, country code included.
  if (!/^[1-9]\d{6,14}$/.test(digits)) {
    throw new Error(
      "Call deep link phoneNumber must be a full international number (country code included), not a phone number ID."
    );
  }
  return digits;
}
