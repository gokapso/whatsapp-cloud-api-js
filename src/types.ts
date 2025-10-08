/** Pacing status returned when sending paced template messages. */
export type MessageStatus = "accepted" | "held_for_quality_assessment";

/**
 * Contact info echoed by the API in send responses.
 * @category Messages
 */
export interface MessageContact {
  input: string;
  waId: string;
}

/**
 * Message info returned in send responses.
 * @category Messages
 */
export interface MessageInfo {
  id: string;
  messageStatus?: MessageStatus;
}

/**
 * Response returned by the Messages API when a message request is accepted.
 * @category Messages
 */
export interface SendMessageResponse {
  messagingProduct: "whatsapp";
  contacts: MessageContact[];
  messages: MessageInfo[];
}

/** Standard Graph success envelope (e.g., deletes/updates). */
export interface GraphSuccessResponse {
  success: true;
}

/** Cursor-based paging info used by list endpoints. */
export interface GraphPaging {
  cursors: {
    before?: string | null;
    after?: string | null;
  };
  next?: string | null;
  previous?: string | null;
  [key: string]: unknown;
}

/** Generic Graph-style paged response. */
export interface PagedResponse<T> {
  data: T[];
  paging: GraphPaging;
  [key: string]: unknown;
}

/** Response from POST /<PHONE_NUMBER_ID>/media. */
export interface MediaUploadResponse {
  id: string;
}

/** Metadata returned by GET /<MEDIA_ID>. */
export interface MediaMetadataResponse {
  messagingProduct: "whatsapp";
  url: string;
  mimeType: string;
  sha256: string;
  fileSize: string;
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
  qualityScoreCategory?: string | null;
  warnings?: unknown;
  previousCategory?: string | null;
  libraryTemplateName?: string | null;
  lastUpdatedTime?: string;
}

/** Response from listing templates on a WABA. */
export type TemplateListResponse = PagedResponse<MessageTemplate>;

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

export interface ConversationRecord {
  id: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  status?: string;
  lastActiveAt?: string;
  kapso?: ConversationKapsoExtensions;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ConversationListResponse = PagedResponse<ConversationRecord>;

export interface ConversationKapsoExtensions {
  contactName?: string;
  messagesCount?: number;
  lastMessageId?: string;
  lastMessageType?: string;
  lastMessageTimestamp?: string;
  lastMessageText?: string | null;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  [key: string]: unknown;
}

export interface MetaMessageContext {
  id?: string;
  from?: string;
  referredProduct?: {
    catalogId?: string;
    productRetailerId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MediaData {
  url?: string;
  filename?: string;
  contentType?: string;
  byteSize?: number;
  [key: string]: unknown;
}

export interface KapsoMessageExtensions {
  direction?: string;
  status?: string;
  processingStatus?: string;
  phoneNumber?: string;
  hasMedia?: boolean;
  mediaData?: MediaData;
  mediaUrl?: string;
  whatsappConversationId?: string;
  contactName?: string;
  messageTypeData?: Record<string, unknown>;
  flowResponse?: Record<string, unknown>;
  flowToken?: string;
  flowName?: string;
  orderText?: string;
  [key: string]: unknown;
}

export interface MetaMessage {
  id: string;
  type: string;
  timestamp: string;
  from?: string;
  to?: string;
  context?: MetaMessageContext | null;
  text?: { body?: string; [key: string]: unknown };
  image?: { id?: string; link?: string; caption?: string; [key: string]: unknown };
  video?: { id?: string; link?: string; caption?: string; [key: string]: unknown };
  audio?: { id?: string; link?: string; [key: string]: unknown };
  document?: { id?: string; link?: string; filename?: string; caption?: string; [key: string]: unknown };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string; [key: string]: unknown };
  interactive?: Record<string, unknown>;
  template?: { name?: string; language?: Record<string, unknown>; components?: Array<Record<string, unknown>>; [key: string]: unknown };
  order?: { catalogId?: string; productItems?: Array<Record<string, unknown>>; orderText?: string; [key: string]: unknown };
  sticker?: { id?: string; link?: string; mimeType?: string; animated?: boolean; [key: string]: unknown };
  contacts?: Array<Record<string, unknown>>;
  reaction?: { emoji?: string; messageId?: string; [key: string]: unknown };
  kapso?: KapsoMessageExtensions;
  [key: string]: unknown;
}

export type UnifiedMessage = MetaMessage;

export type MessageListResponse = PagedResponse<UnifiedMessage>;

export interface ContactRecord {
  id: string;
  waId: string;
  profileName?: string;
  displayName?: string;
  whatsappUserId?: string;
  customerId?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ContactListResponse = PagedResponse<ContactRecord>;

export interface CallingWeeklyHoursEntry {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
  [key: string]: unknown;
}

export interface CallingHolidayScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

export interface CallingSipServer {
  hostname: string;
  port?: number;
  requestUriUserParams?: Record<string, string>;
  sipUserPassword?: string;
  [key: string]: unknown;
}

export interface CallingSipSettings {
  status?: string;
  servers?: CallingSipServer[];
  [key: string]: unknown;
}

export interface CallingHoursSettings {
  status?: string;
  timezoneId?: string;
  weeklyOperatingHours?: CallingWeeklyHoursEntry[];
  holidaySchedule?: CallingHolidayScheduleEntry[];
  [key: string]: unknown;
}

export interface CallingSettings {
  status?: string;
  callIconVisibility?: string;
  callHours?: CallingHoursSettings;
  callbackPermissionStatus?: string;
  sip?: CallingSipSettings;
  [key: string]: unknown;
}

/** Settings returned by GET /<PHONE_NUMBER_ID>/settings. */
export interface PhoneNumberSettingsResponse {
  fallbackLanguage?: string;
  identityChange?: Record<string, unknown>;
  messagingLimit?: Record<string, unknown>;
  twoStepVerification?: Record<string, unknown>;
  calling?: CallingSettings;
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
  profilePictureUrl?: string;
  profilePictureHandle?: string;
  [key: string]: unknown;
}

/** Response from GET /whatsapp_business_profile. */
export interface BusinessProfileGetResponse {
  data: BusinessProfileEntry[];
  paging?: GraphPaging;
}

export interface CallConnectResponse {
  messagingProduct: "whatsapp";
  calls?: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export type CallActionResponse = GraphSuccessResponse & {
  messagingProduct?: "whatsapp";
  [key: string]: unknown;
};

export interface CallPermissionLimit {
  timePeriod: string;
  maxAllowed: number;
  currentUsage: number;
  limitExpirationTime?: number;
  [key: string]: unknown;
}

export interface CallPermissionAction {
  actionName: string;
  canPerformAction: boolean;
  limits?: CallPermissionLimit[];
  [key: string]: unknown;
}

export interface CallPermissionsResponse {
  messagingProduct: "whatsapp";
  permission: {
    status: string;
    expirationTime?: number;
    [key: string]: unknown;
  };
  actions?: CallPermissionAction[];
  [key: string]: unknown;
}

export interface CallRecord {
  id: string;
  direction?: string;
  status?: string;
  durationSeconds?: number;
  startedAt?: string;
  endedAt?: string;
  whatsappConversationId?: string;
  whatsappContactId?: string;
  [key: string]: unknown;
}

export type CallListResponse = PagedResponse<CallRecord>;

/** Standard Graph error envelope (camelCase variant). */
export interface GraphErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    errorSubcode?: number;
    fbtraceId?: string;
    errorData?: Record<string, unknown>;
    [key: string]: unknown;
  };
}
