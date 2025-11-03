import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { WhatsAppClient } from "../src";
import type { MediaMetadataResponse } from "../src";

const defaultJson = { id: "MEDIA123", url: "https://example.com" } as const;

describe("Media resource", () => {
  const setupFetch = (responseInit?: { status?: number; headers?: Record<string, string>; body?: BodyInit }) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      const status = responseInit?.status ?? 200;
      const body = responseInit && "body" in responseInit
        ? responseInit.body
        : status === 204
          ? undefined
          : JSON.stringify(defaultJson);

      return new Response(body, {
        status,
        headers: responseInit?.headers ?? { "Content-Type": "application/json" }
      });
    };

    return { fetchMock, calls } as const;
  };

  let blob: Blob;

  beforeEach(() => {
    blob = new Blob(["media"], { type: "image/png" });
  });

  it("uploads media with FormData payload", async () => {
    const uploadResponse = { id: "MEDIA123" } as const;
    const { fetchMock, calls } = setupFetch({ body: JSON.stringify(uploadResponse) });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.media.upload({
      phoneNumberId: "123",
      type: "image",
      file: blob,
      fileName: "photo.png"
    });
    expect(result).toEqual(uploadResponse);
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<{ id: string }>();
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/media");

    const body = calls[0]?.init.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("image");
    const fileEntry = form.get("file");
    expect(fileEntry).toBeInstanceOf(Blob);
    expect((fileEntry as Blob).type).toBe("image/png");
  });

  it("throws when Kapso proxy is used without phone number id for fetch", async () => {
    const { fetchMock } = setupFetch({ headers: { "Content-Type": "application/octet-stream" }, body: new ArrayBuffer(0) });
    const client = new WhatsAppClient({
      kapsoApiKey: "kapso",
      baseUrl: "https://api.kapso.ai/meta/whatsapp",
      fetch: fetchMock
    });

    await expect(client.media.get({ mediaId: "ABC" })).rejects.toThrowError(
      "phoneNumberId is required when using the Kapso proxy"
    );
  });

  it("fetches media metadata and appends phone_number_id when provided", async () => {
    const metadata = {
      messaging_product: "whatsapp",
      url: "https://cdn.kapso.ai/media/123",
      mime_type: "image/png",
      sha256: "hash",
      file_size: "1234",
      id: "MEDIA_ID"
    } as const;
    const expected: MediaMetadataResponse = {
      messagingProduct: "whatsapp",
      url: "https://cdn.kapso.ai/media/123",
      mimeType: "image/png",
      sha256: "hash",
      fileSize: "1234",
      id: "MEDIA_ID"
    };
    const { fetchMock, calls } = setupFetch({ body: JSON.stringify(metadata) });
    const client = new WhatsAppClient({ kapsoApiKey: "kapso", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    const response = await client.media.get({ mediaId: "MEDIA_ID", phoneNumberId: "123" });

    expect(response).toEqual(expected);
    expectTypeOf(response).toMatchTypeOf<MediaMetadataResponse>();
    expect(calls[0]?.url).toBe("https://api.kapso.ai/meta/whatsapp/v23.0/MEDIA_ID?phone_number_id=123");
  });

  it("deletes media with Kapso phone_number_id query", async () => {
    const { fetchMock, calls } = setupFetch({ body: JSON.stringify({ success: true }) });
    const client = new WhatsAppClient({ kapsoApiKey: "kapso", baseUrl: "https://api.kapso.ai/meta/whatsapp", fetch: fetchMock });

    const result = await client.media.delete({ mediaId: "MEDIA_ID", phoneNumberId: "123" });

    expect(result).toEqual({ success: true });
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://api.kapso.ai/meta/whatsapp/v23.0/MEDIA_ID?phone_number_id=123");
  });
});
