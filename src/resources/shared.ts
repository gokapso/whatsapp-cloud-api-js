import { GraphApiError } from "../errors";
import { toCamelCaseDeep } from "../utils/case";

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await safeReadText(response);
    let parsed: unknown;

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }

    throw GraphApiError.fromResponse(response, parsed, text);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    return toCamelCaseDeep(json) as T;
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.text()) as unknown as T;
}

export async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    return String(error);
  }
}
