import { createHash } from "node:crypto";
import { isPlainObject } from "./case";

type TransformOptions = {
  strictCamel?: boolean;
};

const UNDERSCORE_KEYS = new Map<string, string>([
  ["dataApiVersion", "data_api_version"],
  ["routingModel", "routing_model"],
  ["refreshOnBack", "refresh_on_back"],
  ["dataChannelUri", "data_channel_uri"],
  ["previewParameters", "preview_parameters"],
  ["validationErrors", "validation_errors"],
  ["healthStatus", "health_status"],
  ["jsonVersion", "json_version"],
  ["dataApi", "data_api"],
  ["endpointUri", "endpoint_uri"]
]);

const KEBAB_KEYS = new Map<string, string>([
  ["onClickAction", "on-click-action"],
  ["onSelectAction", "on-select-action"],
  ["onUnselectAction", "on-unselect-action"],
  ["onDeselectAction", "on-deselect-action"],
  ["onBackAction", "on-back-action"],
  ["dataSource", "data-source"],
  ["initValue", "init-value"],
  ["initValues", "init-values"],
  ["errorMessage", "error-message"],
  ["helperText", "helper-text"],
  ["minChars", "min-chars"],
  ["maxChars", "max-chars"],
  ["minLength", "min-length"],
  ["maxLength", "max-length"],
  ["labelVariant", "label-variant"],
  ["fontWeight", "font-weight"],
  ["maxUploadedPhotos", "max-uploaded-photos"],
  ["maxUploadedDocuments", "max-uploaded-documents"],
  ["minUploadedPhotos", "min-uploaded-photos"],
  ["minUploadedDocuments", "min-uploaded-documents"],
  ["photoSource", "photo-source"],
  ["mediaSize", "media-size"],
  ["altText", "alt-text"],
  ["aspectRatio", "aspect-ratio"],
  ["flowToken", "flow_token"],
  ["flowAction", "flow_action"],
  ["flowActionPayload", "flow_action_payload"],
  ["phoneNumber", "phone_number"],
  ["leftCaption", "left-caption"],
  ["centerCaption", "center-caption"],
  ["rightCaption", "right-caption"],
  ["markdown", "markdown"],
  ["limitedTimeOffer", "limited-time-offer"],
  ["limitedTimeOfferExpirationTime", "limited-time-offer-expiration-time"],
  ["listItems", "list-items"],
  ["onClick", "on-click"],
  ["onSelect", "on-select"],
  ["onUnselect", "on-unselect"],
  ["maxSelectedItems", "max-selected-items"],
  ["minSelectedItems", "min-selected-items"],
  ["descriptionText", "description-text"],
  ["includeDays", "include-days"],
  ["minDate", "min-date"],
  ["maxDate", "max-date"],
  ["unavailableDates", "unavailable-dates"],
  ["mode", "mode"],
  ["initError", "init-error"],
  ["errorMessages", "error-messages"],
  ["pageSize", "page-size"],
  ["displayMode", "display-mode"],
  ["capabilities", "capabilities"],
  ["markdownEnabled", "markdown-enabled"],
  ["mediaUrl", "media-url"],
  ["flowActionData", "flow_action_data"],
  ["flowId", "flow_id"],
  ["flowName", "flow_name"]
]);

const REVERSE_UNDERSCORE_KEYS = new Map<string, string>();
const REVERSE_KEBAB_KEYS = new Map<string, string>();
for (const [camel, wire] of UNDERSCORE_KEYS.entries()) {
  REVERSE_UNDERSCORE_KEYS.set(wire, camel);
}
for (const [camel, wire] of KEBAB_KEYS.entries()) {
  REVERSE_KEBAB_KEYS.set(wire, camel);
}

const STRICT_IGNORE_KEYS = new Set(["__example__"]);

const PRESERVE_KEYS = new Set([
  "version",
  "screens",
  "id",
  "title",
  "terminal",
  "success",
  "sensitive",
  "data",
  "layout",
  "children",
  "type",
  "name",
  "visible",
  "required",
  "enabled",
  "form",
  "payload",
  "action",
  "screen",
  "flowToken",
  "flow_token",
  "flowActionPayload",
  "flow_action_payload",
  "flowAction",
  "flow_action",
  "flowId",
  "flow_id"
]);

let hashImplementation: ((input: string) => string) | undefined = initializeHashImplementation();

function initializeHashImplementation(): ((input: string) => string) | undefined {
  try {
    if (typeof createHash === "function") {
      return (input: string) => createHash("sha256").update(input).digest("hex");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

interface TransformFrame {
  isComponent: boolean;
}

export function toFlowJsonWireCase<T>(input: T, options: TransformOptions = {}): T {
  const { strictCamel = true } = options;

  const transform = (value: unknown, frame: TransformFrame): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => transform(item, frame));
    }

    if (isPlainObject(value)) {
      const isComponent = isComponentObject(value as Record<string, unknown>);
      const result: Record<string, unknown> = {};
      for (const [rawKey, rawVal] of Object.entries(value)) {
        if (strictCamel && shouldEnforceCamel(rawKey)) {
          const expected = suggestCamelCase(rawKey);
          throw new Error(`Flow JSON authoring should use camelCase key "${expected}" instead of "${rawKey}". Please update your source.`);
        }

        const mappedKey = mapAuthoringKey(rawKey, isComponent);
        result[mappedKey] = transform(rawVal, { isComponent });
      }
      return result;
    }

    return value;
  };

  return transform(input, { isComponent: false }) as T;
}

export function fromFlowJsonWireCase<T>(input: T): T {
  const transform = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(transform);
    }

    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [rawKey, rawVal] of Object.entries(value)) {
        const camelKey = mapWireKey(rawKey);
        result[camelKey] = transform(rawVal);
      }
      return result;
    }

    return value;
  };

  return transform(input) as T;
}

function isComponentObject(value: Record<string, unknown>): boolean {
  if (typeof value.type !== "string") return false;
  const type = value.type as string;
  return /^[A-Z]/.test(type);
}

function mapAuthoringKey(key: string, isComponent: boolean): string {
  if (UNDERSCORE_KEYS.has(key)) {
    return UNDERSCORE_KEYS.get(key)!;
  }
  if (KEBAB_KEYS.has(key)) {
    return KEBAB_KEYS.get(key)!;
  }
  if (PRESERVE_KEYS.has(key)) {
    return key;
  }
  if (/^[A-Z0-9_]+$/.test(key)) {
    return key;
  }
  if (isComponent && /[A-Z]/.test(key)) {
    return camelToKebab(key);
  }
  return key;
}

function mapWireKey(key: string): string {
  if (REVERSE_UNDERSCORE_KEYS.has(key)) {
    return REVERSE_UNDERSCORE_KEYS.get(key)!;
  }
  if (REVERSE_KEBAB_KEYS.has(key)) {
    return REVERSE_KEBAB_KEYS.get(key)!;
  }
  if (key.startsWith("__") && key.endsWith("__")) {
    return key;
  }
  if (key.includes("-")) {
    return key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
  if (key.includes("_")) {
    return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
  return key;
}

function shouldEnforceCamel(key: string): boolean {
  if (STRICT_IGNORE_KEYS.has(key)) return false;
  if (key.startsWith("__") && key.endsWith("__")) return false;
  return key.includes("_") || key.includes("-");
}

function suggestCamelCase(key: string): string {
  return key
    .replace(/^__/, "__")
    .replace(/[-_]+([a-z0-9])/gi, (_, char: string) => char.toUpperCase())
    .replace(/^([A-Z])/, (match) => match.toLowerCase());
}

function camelToKebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function canonicalizeFlowJson(value: unknown): string {
  const canonical = canonicalize(value);
  return JSON.stringify(canonical);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = canonicalize(val);
    }
    return result;
  }

  return value;
}

export function computeFlowJsonHash(value: unknown): string {
  const canonical = canonicalizeFlowJson(value);
  if (hashImplementation) {
    return hashImplementation(canonical);
  }
  throw new Error("SHA-256 hashing is not available in this environment");
}

export function toWireKeyName(key: string): string {
  return mapAuthoringKey(key);
}

export function fromWireKeyName(key: string): string {
  return mapWireKey(key);
}

export function __setHashImplementation(fn?: ((input: string) => string) | null): void {
  if (fn === null) {
    hashImplementation = undefined;
    return;
  }
  if (fn) {
    hashImplementation = fn;
    return;
  }
  hashImplementation = initializeHashImplementation();
}
