/** Pacing status returned when sending paced template messages. */
export type MessageStatus = "accepted" | "held_for_quality_assessment";

/**
 * Contact info echoed by the API in send responses.
 * @category Messages
 */
export interface MessageContact {
  input: string;
  wa_id: string;
}

/**
 * Message info returned in send responses.
 * @category Messages
 */
export interface MessageInfo {
  id: string;
  message_status?: MessageStatus;
}

/**
 * Response returned by the Messages API when a message request is accepted.
 * @category Messages
 */
export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: MessageContact[];
  messages: MessageInfo[];
}

/** Standard Graph success envelope (e.g., deletes/updates). */
export interface GraphSuccessResponse {
  success: true;
}

/** Cursor-based paging info used by list endpoints. */
export interface GraphPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
  previous?: string;
}

/** Response from POST /<PHONE_NUMBER_ID>/media. */
export interface MediaUploadResponse {
  id: string;
}

/** Metadata returned by GET /<MEDIA_ID>. */
export interface MediaMetadataResponse {
  messaging_product: "whatsapp";
  url: string;
  mime_type: string;
  sha256: string;
  file_size: string;
  id: string;
}

/** Template review status. */
export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "IN_APPEAL" | "DISABLED";
/** Template categories. */
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION" | "UNKNOWN";

/** Template entity as returned by the WABA message_templates API. */
export interface MessageTemplate {
  id: string;
  name: string;
  category?: TemplateCategory | string;
  language?: string;
  status?: TemplateStatus | string;
  components?: Array<Record<string, unknown>>;
  quality_score_category?: string | null;
  warnings?: unknown;
  previous_category?: string | null;
  library_template_name?: string | null;
  last_updated_time?: string;
}

/** Response from listing templates on a WABA. */
export interface TemplateListResponse {
  data: MessageTemplate[];
  paging?: GraphPaging;
}

/** Response from creating a template. */
export interface TemplateCreateResponse {
  id: string;
  status: TemplateStatus | string;
  category: TemplateCategory | string;
}

/** Response from deleting a template. */
export type TemplateDeleteResponse = GraphSuccessResponse;

export type PhoneNumberRequestCodeResponse = GraphSuccessResponse;
export type PhoneNumberVerifyCodeResponse = GraphSuccessResponse;
export type PhoneNumberRegisterResponse = GraphSuccessResponse;
export type PhoneNumberDeregisterResponse = GraphSuccessResponse;
export type PhoneNumberSettingsUpdateResponse = GraphSuccessResponse;
export type BusinessProfileUpdateResponse = GraphSuccessResponse;

/** Settings returned by GET /<PHONE_NUMBER_ID>/settings. */
export interface PhoneNumberSettingsResponse {
  fallback_language?: string;
  identity_change?: Record<string, unknown>;
  messaging_limit?: Record<string, unknown>;
  two_step_verification?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A single business profile entry returned by GET /whatsapp_business_profile. */
export interface BusinessProfileEntry {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
  profile_picture_handle?: string;
  [key: string]: unknown;
}

/** Response from GET /whatsapp_business_profile. */
export interface BusinessProfileGetResponse {
  data: BusinessProfileEntry[];
  paging?: GraphPaging;
}

/** Standard Graph error envelope. */
export interface GraphErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
    [key: string]: unknown;
  };
}
