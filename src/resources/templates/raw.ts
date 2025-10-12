import { z } from "zod";
import type {
  TemplateBodyComponent,
  TemplateBodyParameter,
  TemplateButtonCatalogComponent,
  TemplateButtonComponent,
  TemplateButtonCopyCodeComponent,
  TemplateButtonFlowComponent,
  TemplateButtonParameterFlow,
  TemplateButtonParameterQuickReply,
  TemplateButtonParameterText,
  TemplateButtonPhoneComponent,
  TemplateButtonQuickReplyComponent,
  TemplateButtonUrlComponent,
  TemplateHeaderComponent,
  TemplateHeaderParameter,
  TemplateSendPayload
} from "./types";

const rawComponentSchema = z.object({
  type: z.string().min(1),
  parameters: z.any().optional(),
  sub_type: z.any().optional(),
  subType: z.any().optional(),
  index: z.any().optional()
}).passthrough();

const rawTemplatePayloadSchema = z
  .object({
    name: z.string().min(1),
    language: z.union([
      z.string().min(1),
      z.object({ code: z.string().min(1), policy: z.literal("deterministic") }).strict()
    ]),
    // Allow parameterless templates: components can be an empty array
    components: z.array(rawComponentSchema)
  })
  .strict();

export type RawTemplatePayloadInput = z.input<typeof rawTemplatePayloadSchema>;

export function buildTemplatePayload(input: RawTemplatePayloadInput): TemplateSendPayload {
  let parsed: z.infer<typeof rawTemplatePayloadSchema>;
  try {
    parsed = rawTemplatePayloadSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const typeIssue = error.issues.find((issue) =>
        issue.path.length >= 3 &&
        issue.path[0] === "components" &&
        issue.path[2] === "type"
      );
      if (typeIssue) {
        const componentIndex = typeIssue.path[1];
        throw new Error(`components[${String(componentIndex)}].type is required`);
      }
    }
    throw error;
  }
  const language = typeof parsed.language === "string" ? { code: parsed.language } : parsed.language;

  const components = parsed.components.map((component, componentIndex) => {
    const path = `components[${componentIndex}]`;
    const typeRaw = (component as any).type;
    if (typeof typeRaw !== "string") {
      throw new Error(`${path}.type is required`);
    }

    const type = typeRaw.toLowerCase();

    switch (type) {
      case "header":
        return {
          type: "header",
          parameters: [normalizeHeaderParameter(component.parameters, path)]
        } satisfies TemplateHeaderComponent;
      case "body":
        return {
          type: "body",
          parameters: normalizeBodyParameters(component.parameters, path)
        } satisfies TemplateBodyComponent;
      case "button":
        return normalizeButtonComponent(component, path);
      default:
        throw new Error(`${path}.type '${component.type}' is not supported`);
    }
  });

  return {
    name: parsed.name,
    language,
    components
  };
}

function normalizeHeaderParameter(parameters: unknown, path: string) {
  if (!Array.isArray(parameters) || parameters.length !== 1) {
    throw new Error(`${path}.parameters must be an array with exactly one entry for header components`);
  }

  const param = clone(parameters[0]);
  const paramPath = `${path}.parameters[0]`;

  if (!param || typeof param !== "object" || typeof (param as any).type !== "string") {
    throw new Error(`${paramPath}.type is required`);
  }

  const type = ((param as any).type as string).toLowerCase();
  (param as any).type = type;

  if (type === "text") {
    const text = ensureString((param as any).text, `${paramPath}.text`);
    if (!text.trim()) {
      throw new Error(`${paramPath}.text must be a non-empty string`);
    }
    (param as any).text = text;
    return param as TemplateHeaderParameter;
  }

  if (type === "image" || type === "video" || type === "document") {
    const mediaKey = type;
    const media = clone((param as any)[mediaKey]);
    if (!media || typeof media !== "object") {
      throw new Error(`${paramPath}.${mediaKey} must be an object containing id or link`);
    }
    const id = (media as any).id;
    const link = (media as any).link;
    if (!id && !link) {
      throw new Error(`${paramPath}.${mediaKey} requires id or link`);
    }
    if (link) {
      ensureValidUrl(link, `${paramPath}.${mediaKey}.link`);
    }
    (param as any)[mediaKey] = media;
    return param as TemplateHeaderParameter;
  }

  if (type === "location") {
    const location = clone((param as any).location);
    if (!location || typeof location !== "object") {
      throw new Error(`${paramPath}.location must be an object`);
    }
    const latitude = (location as any).latitude;
    const longitude = (location as any).longitude;
    if (!isNumberLike(latitude) || !isNumberLike(longitude)) {
      throw new Error(`${paramPath}.location.latitude and longitude must be provided`);
    }
    (param as any).location = {
      ...location,
      latitude,
      longitude
    };
    return param as TemplateHeaderParameter;
  }

  throw new Error(`${paramPath}.type '${type}' is not supported in header component`);
}

function normalizeBodyParameters(parameters: unknown, path: string) {
  if (!Array.isArray(parameters) || parameters.length === 0) {
    throw new Error(`${path}.parameters must be a non-empty array for body components`);
  }

  return parameters.map((parameter, index) => {
    const paramPath = `${path}.parameters[${index}]`;
    const cloned = clone(parameter);
    if (!cloned || typeof cloned !== "object" || typeof (cloned as any).type !== "string") {
      throw new Error(`${paramPath}.type is required`);
    }

    const type = ((cloned as any).type as string).toLowerCase();
    (cloned as any).type = type;

    if (type === "text") {
      const text = ensureString((cloned as any).text, `${paramPath}.text`);
      if (!text.trim()) {
        throw new Error(`${paramPath}.text must be a non-empty string`);
      }
      (cloned as any).text = text;
      return cloned as TemplateBodyParameter;
    }

    if (type === "currency") {
      const currency = clone((cloned as any).currency);
      if (!currency || typeof currency !== "object") {
        throw new Error(`${paramPath}.currency must be an object`);
      }
      const fallbackValueKey = (currency as any).fallbackValue !== undefined ? "fallbackValue" : "fallback_value";
      ensureString((currency as any)[fallbackValueKey], `${paramPath}.currency.fallback_value`);
      ensureString((currency as any).code, `${paramPath}.currency.code`);
      const amountKey = (currency as any).amount1000 !== undefined ? "amount1000" : "amount_1000";
      const amount = (currency as any)[amountKey];
      if (!Number.isInteger(amount)) {
        throw new Error(`${paramPath}.currency.amount_1000 must be an integer`);
      }
      (cloned as any).currency = currency;
      return cloned as TemplateBodyParameter;
    }

    if (type === "date_time") {
      const dateTimeKey = (cloned as any).dateTime !== undefined ? "dateTime" : "date_time";
      const dateTime = clone((cloned as any)[dateTimeKey]);
      if (!dateTime || typeof dateTime !== "object") {
        throw new Error(`${paramPath}.date_time must be an object`);
      }
      const fallbackValueKey = (dateTime as any).fallbackValue !== undefined ? "fallbackValue" : "fallback_value";
      ensureString((dateTime as any)[fallbackValueKey], `${paramPath}.date_time.fallback_value`);
      (cloned as any)[dateTimeKey] = dateTime;
      return cloned as TemplateBodyParameter;
    }

    throw new Error(`${paramPath}.type '${type}' is not supported in body component`);
  }) as TemplateBodyParameter[];
}

function normalizeButtonComponent(component: Record<string, unknown>, path: string) {
  const subTypeRaw = (component as any).subType ?? (component as any).sub_type;
  const subType = ensureString(subTypeRaw, `${path}.sub_type`).toLowerCase();
  const index = (component as any).index;
  if (index === undefined || index === null) {
    throw new Error(`${path}.index is required for button components`);
  }
  const indexNumber = typeof index === "string" ? Number(index) : index;
  if (!Number.isInteger(indexNumber) || indexNumber < 0 || indexNumber > 9) {
    throw new Error(`${path}.index must be an integer between 0 and 9`);
  }

  const parameters = component.parameters;

  switch (subType) {
    case "quick_reply": {
      const params = normalizeQuickReplyParameters(parameters, path);
      const result: TemplateButtonQuickReplyComponent = {
        type: "button",
        subType: "quick_reply",
        index: indexNumber,
        parameters: params
      };
      return result;
    }
    case "url": {
      const params = normalizeButtonTextParameters(parameters, path);
      if (!params) {
        throw new Error(`${path}.parameters must include at least one entry`);
      }
      const result: TemplateButtonUrlComponent = {
        type: "button",
        subType: "url",
        index: indexNumber,
        parameters: params
      };
      return result;
    }
    case "phone_number": {
      const params = normalizeButtonTextParameters(parameters, path, { optional: true });
      const result: TemplateButtonPhoneComponent = params
        ? {
            type: "button",
            subType: "phone_number",
            index: indexNumber,
            parameters: params
          }
        : {
            type: "button",
            subType: "phone_number",
            index: indexNumber
          };
      return result;
    }
    case "copy_code": {
      const params = normalizeButtonTextParameters(parameters, path, { maxLength: 15 });
      if (!params) {
        throw new Error(`${path}.parameters must include at least one entry`);
      }
      const result: TemplateButtonCopyCodeComponent = {
        type: "button",
        subType: "copy_code",
        index: indexNumber,
        parameters: params
      };
      return result;
    }
    case "flow": {
      const params = normalizeFlowParameters(parameters, path);
      const result: TemplateButtonFlowComponent = params
        ? {
            type: "button",
            subType: "flow",
            index: indexNumber,
            parameters: params
          }
        : {
            type: "button",
            subType: "flow",
            index: indexNumber
          };
      return result;
    }
    case "catalog": {
      if (parameters !== undefined && !Array.isArray(parameters)) {
        throw new Error(`${path}.parameters must be an array`);
      }
      const result: TemplateButtonCatalogComponent = parameters
        ? {
            type: "button",
            subType: "catalog",
            index: indexNumber,
            parameters: parameters as Array<Record<string, unknown>>
          }
        : {
            type: "button",
            subType: "catalog",
            index: indexNumber
          };
      return result;
    }
    default:
      throw new Error(`${path}.sub_type '${subType}' is not supported`);
  }
}

function ensureString(value: unknown, path: string) {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  return value;
}

function ensureValidUrl(value: unknown, path: string) {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string URL`);
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`${path} must be a valid URL`);
  }
}

function normalizeQuickReplyParameters(parameters: unknown, path: string): TemplateButtonParameterQuickReply[] {
  if (!Array.isArray(parameters) || parameters.length === 0) {
    throw new Error(`${path}.parameters must include at least one entry`);
  }

  return parameters.map((param, paramIndex) => {
    const cloned = clone(param);
    if (!cloned || typeof cloned !== "object" || typeof (cloned as any).type !== "string") {
      throw new Error(`${path}.parameters[${paramIndex}].type is required`);
    }
    (cloned as any).type = ((cloned as any).type as string).toLowerCase();
    if ((cloned as any).type !== "payload") {
      throw new Error(`${path}.parameters[${paramIndex}].type must be 'payload'`);
    }
    ensureString((cloned as any).payload, `${path}.parameters[${paramIndex}].payload`);
    return cloned as TemplateButtonParameterQuickReply;
  }) as TemplateButtonParameterQuickReply[];
}

function normalizeButtonTextParameters(
  parameters: unknown,
  path: string,
  options: { optional?: boolean; maxLength?: number } = {}
): TemplateButtonParameterText[] | undefined {
  if (!Array.isArray(parameters) || parameters.length === 0) {
    if (options.optional) {
      return undefined;
    }
    throw new Error(`${path}.parameters must include at least one entry`);
  }

  return parameters.map((param, index) => {
    const cloned = clone(param);
    if (!cloned || typeof cloned !== "object" || typeof (cloned as any).type !== "string") {
      throw new Error(`${path}.parameters[${index}].type is required`);
    }
    (cloned as any).type = ((cloned as any).type as string).toLowerCase();
    if ((cloned as any).type !== "text") {
      throw new Error(`${path}.parameters[${index}].type must be 'text'`);
    }
    const text = ensureString((cloned as any).text, `${path}.parameters[${index}].text`);
    if (!text.trim()) {
      throw new Error(`${path}.parameters[${index}].text must be a non-empty string`);
    }
    if (options.maxLength && text.length > options.maxLength) {
      throw new Error(`${path}.parameters[${index}].text must be <= ${options.maxLength} characters`);
    }
    return cloned as TemplateButtonParameterText;
  }) as TemplateButtonParameterText[];
}

function normalizeFlowParameters(parameters: unknown, path: string): TemplateButtonParameterFlow[] | undefined {
  if (parameters === undefined) {
    return undefined;
  }
  if (!Array.isArray(parameters)) {
    throw new Error(`${path}.parameters must be an array`);
  }

  return parameters.map((param, index) => {
    const cloned = clone(param);
    if (cloned && typeof cloned === "object" && "type" in (cloned as any) && typeof (cloned as any).type === "string") {
      (cloned as any).type = ((cloned as any).type as string).toLowerCase();
    }
    return cloned as TemplateButtonParameterFlow;
  }) as TemplateButtonParameterFlow[];
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Array.isArray(value) ? (value.map((item) => clone(item)) as unknown as T) : { ...value } as T;
}

function isNumberLike(value: unknown) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)));
}
