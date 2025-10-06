const camelCache = new Map<string, string>();
const snakeCache = new Map<string, string>();

function toCamelCaseKey(key: string): string {
  if (!key.includes("_") && !key.includes("-")) {
    return key;
  }

  const cached = camelCache.get(key);
  if (cached) return cached;

  const result = key.replace(/[\-_]([a-z0-9])/gi, (_, char: string) => char.toUpperCase());
  camelCache.set(key, result);
  return result;
}

function toSnakeCaseKey(key: string): string {
  if (!/[A-Z]/.test(key)) {
    return key;
  }

  const cached = snakeCache.get(key);
  if (cached) return cached;

  if (/^[A-Z0-9_]+$/.test(key)) {
    snakeCache.set(key, key);
    return key;
  }

  const result = key
    .replace(/([A-Z\d]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();

  snakeCache.set(key, result);
  return result;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function toCamelCaseDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => toCamelCaseDeep(item)) as unknown as T;
  }

  if (isPlainObject(input)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[toCamelCaseKey(key)] = toCamelCaseDeep(value);
    }

    return result as T;
  }

  return input;
}

export function toSnakeCaseDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => toSnakeCaseDeep(item)) as unknown as T;
  }

  if (isPlainObject(input)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[toSnakeCaseKey(key)] = toSnakeCaseDeep(value);
    }

    return result as T;
  }

  return input;
}
