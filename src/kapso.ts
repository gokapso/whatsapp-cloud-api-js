export const KAPSO_MESSAGE_FIELDS = [
  "direction",
  "status",
  "processing_status",
  "phone_number",
  "has_media",
  "media_data",
  "whatsapp_conversation_id",
  "contact_name",
  "message_type_data",
  "flow_response",
  "flow_token",
  "flow_name",
  "order_text"
] as const;

export type KapsoMessageField = (typeof KAPSO_MESSAGE_FIELDS)[number];

export function buildKapsoFields(
  fields: ReadonlyArray<string> = KAPSO_MESSAGE_FIELDS
): string {
  const unique = Array.from(new Set(fields.map((field) => field.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return "kapso()";
  }
  return `kapso(${unique.join(",")})`;
}

export function buildKapsoMessageFields(
  ...fields: Array<KapsoMessageField | ReadonlyArray<KapsoMessageField>>
): string {
  const flat = fields.flatMap((field) => (Array.isArray(field) ? field : [field]));
  if (flat.length === 0) {
    return buildKapsoFields();
  }
  return buildKapsoFields(flat);
}
