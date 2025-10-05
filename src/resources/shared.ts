export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new Error(`Meta API request failed with status ${response.status}: ${detail}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
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
