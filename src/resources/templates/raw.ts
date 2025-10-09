import { z } from "zod";

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

export function buildTemplatePayload(input: RawTemplatePayloadInput) {
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
        throw new Error(`components[${componentIndex}].type is required`);
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
        };
      case "body":
        return {
          type: "body",
          parameters: normalizeBodyParameters(component.parameters, path)
        };
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
    return param;
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
    return param;
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
    return param;
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
      return cloned;
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
      return cloned;
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
      return cloned;
    }

    throw new Error(`${paramPath}.type '${type}' is not supported in body component`);
  });
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
  let normalizedParameters: Array<Record<string, unknown>> | undefined;

  switch (subType) {
    case "quick_reply":
      normalizedParameters = normalizeQuickReplyParameters(parameters, path);
      break;
    case "url":
      normalizedParameters = normalizeButtonTextParameters(parameters, path);
      break;
    case "phone_number":
      normalizedParameters = normalizeButtonTextParameters(parameters, path, { optional: true });
      break;
    case "copy_code":
      normalizedParameters = normalizeButtonTextParameters(parameters, path, { maxLength: 15 });
      break;
    case "flow":
      normalizedParameters = normalizeFlowParameters(parameters, path);
      break;
    case "catalog":
      // Pass-through for catalog subtype (no strict validation of parameters here)
      if (parameters !== undefined && !Array.isArray(parameters)) {
        throw new Error(`${path}.parameters must be an array`);
      }
      normalizedParameters = parameters as Array<Record<string, unknown>> | undefined;
      break;
    default:
      throw new Error(`${path}.sub_type '${subType}' is not supported`);
  }

  const result: Record<string, unknown> = {
    type: "button",
    subType,
    index: indexNumber
  };

  if (normalizedParameters !== undefined) {
    result.parameters = normalizedParameters;
  }

  return result;
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

function normalizeQuickReplyParameters(parameters: unknown, path: string) {
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
    return cloned as Record<string, unknown>;
  });
}

function normalizeButtonTextParameters(
  parameters: unknown,
  path: string,
  options: { optional?: boolean; maxLength?: number } = {}
): Array<Record<string, unknown>> | undefined {
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
    return cloned as Record<string, unknown>;
  });
}

function normalizeFlowParameters(parameters: unknown, path: string) {
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
    return cloned as Record<string, unknown>;
  });
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
