import { describe, it, expect, expectTypeOf } from "vitest";
import { WhatsAppClient } from "../src";

describe("MediaResource.download", () => {
  function setupFetch(handlers: Array<(url: string, init: RequestInit) => Response | Promise<Response>>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let i = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const call = { url, init: (init ?? {}) as RequestInit };
      calls.push(call);
      const handler = handlers[i] ?? handlers[handlers.length - 1];
      i += 1;
      return await handler(url, call.init);
    };
    return { fetchMock, calls } as const;
  }

  it("downloads bytes from Meta lookaside URL WITHOUT Authorization header (default: arrayBuffer)", async () => {
    const metaUrl = "https://lookaside.cdnwhatsapp.net/m/abc";
    const { fetchMock, calls } = setupFetch([
      // 1) GET metadata for media id
      () => new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          url: metaUrl,
          mime_type: "image/png",
          sha256: "hash",
          file_size: "4",
          id: "MEDIA_ID"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      // 2) Download from the lookaside URL (binary)
      () => new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const bytes = await client.media.download({ mediaId: "MEDIA_ID" });

    // call 1: metadata fetch
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/MEDIA_ID");
    // call 2: direct URL fetch without auth header (lookaside rejects Authorization)
    expect(calls[1]?.url).toBe(metaUrl);
    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["Authorization"]).toBeUndefined();

    // result is an ArrayBuffer by default
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    const view = new Uint8Array(bytes as ArrayBuffer);
    expect([...view]).toEqual([1, 2, 3, 4]);
  });

  it("honors auth: 'never' on lookaside (no Authorization header)", async () => {
    const metaUrl = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA_ID";
    const { fetchMock, calls } = setupFetch([
      // metadata
      () => new Response(
        JSON.stringify({ messaging_product: "whatsapp", url: metaUrl, mime_type: "image/png", id: "MEDIA_ID", sha256: "", file_size: "4" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      // binary
      () => new Response(new Uint8Array([5, 6, 7, 8]), { status: 200, headers: { "Content-Type": "image/png" } })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const buf = await client.media.download({ mediaId: "MEDIA_ID", auth: "never" });
    expect(buf).toBeInstanceOf(ArrayBuffer);
    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["Authorization"]).toBeUndefined();
  });

  it("honors auth: 'always' on lookaside (Authorization present)", async () => {
    const metaUrl = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA2";
    const { fetchMock, calls } = setupFetch([
      // metadata
      () => new Response(
        JSON.stringify({ messaging_product: "whatsapp", url: metaUrl, mime_type: "image/jpeg", id: "MEDIA2", sha256: "", file_size: "4" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      // binary
      () => new Response(new Uint8Array([9, 9, 9, 9]), { status: 200, headers: { "Content-Type": "image/jpeg" } })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await client.media.download({ mediaId: "MEDIA2", auth: "always" });
    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["Authorization"]).toBe("Bearer token");
  });

  it("honors auth: 'never' on Kapso host (no X-API-Key header)", async () => {
    const kapsoUrl = "https://cdn.kapso.ai/media/abc";
    const { fetchMock, calls } = setupFetch([
      () => new Response(
        JSON.stringify({ messaging_product: "whatsapp", url: kapsoUrl, mime_type: "image/png", id: "MEDIA3", sha256: "", file_size: "4" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "image/png" } })
    ]);

    const client = new WhatsAppClient({ kapsoApiKey: "kapso", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });
    await client.media.download({ mediaId: "MEDIA3", phoneNumberId: "123", auth: "never" });
    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["X-API-Key"]).toBeUndefined();
  });

  it("downloads bytes via Kapso proxy requiring phoneNumberId and X-API-Key header", async () => {
    const cdnUrl = "https://cdn.kapso.ai/media/123";
    const { fetchMock, calls } = setupFetch([
      // 1) metadata (Kapso requires phone_number_id query)
      () => new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          url: cdnUrl,
          mime_type: "image/png",
          sha256: "hash",
          file_size: "4",
          id: "MEDIA_ID"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      // 2) binary
      () => new Response(new Uint8Array([9, 8, 7, 6]), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      })
    ]);

    const client = new WhatsAppClient({
      kapsoApiKey: "kapso",
      baseUrl: "https://app.kapso.ai/api/meta",
      fetch: fetchMock
    });

    const bytes = await client.media.download({ mediaId: "MEDIA_ID", phoneNumberId: "123" });

    expect(calls[0]?.url).toBe("https://app.kapso.ai/api/meta/v23.0/MEDIA_ID?phone_number_id=123");
    expect(calls[1]?.url).toBe(cdnUrl);
    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["X-API-Key"]).toBe("kapso");
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    const view = new Uint8Array(bytes as ArrayBuffer);
    expect([...view]).toEqual([9, 8, 7, 6]);
  });

  it("returns a Blob when as=blob and keeps content type", async () => {
    const metaUrl = "https://lookaside.cdnwhatsapp.net/m/xyz";
    const { fetchMock } = setupFetch([
      () => new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          url: metaUrl,
          mime_type: "image/png",
          sha256: "hash",
          file_size: "4",
          id: "MEDIA_ID"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      () => new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "image/png" }
      })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const blob = await client.media.download({ mediaId: "MEDIA_ID", as: "blob" });
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("image/png");
    expect((blob as Blob).size).toBe(4);
  });

  it("passes through custom headers and skips Authorization on lookaside hosts", async () => {
    const metaUrl = "https://lookaside.cdnwhatsapp.net/m/ua";
    const { fetchMock, calls } = setupFetch([
      () => new Response(
        JSON.stringify({ url: metaUrl, mime_type: "image/jpeg", id: "MEDIA_ID", messaging_product: "whatsapp", sha256: "", file_size: "2" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      () => new Response(new Uint8Array([10, 11]), { status: 200, headers: { "Content-Type": "image/jpeg" } })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await client.media.download({ mediaId: "MEDIA_ID", headers: { "User-Agent": "curl/7.64.1" } });

    const headers2 = (calls[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers2["User-Agent"]).toBe("curl/7.64.1");
  });

  it("can return Response when as=response", async () => {
    const metaUrl = "https://lookaside.cdnwhatsapp.net/m/resp";
    const { fetchMock } = setupFetch([
      () => new Response(
        JSON.stringify({ url: metaUrl, mime_type: "application/octet-stream", id: "MEDIA_ID", messaging_product: "whatsapp", sha256: "", file_size: "2" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      () => new Response(new Uint8Array([42, 42]), { status: 200, headers: { "Content-Type": "application/octet-stream" } })
    ]);

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    const res = await client.media.download({ mediaId: "MEDIA_ID", as: "response" });
    expect(res).toBeInstanceOf(Response);
    expect(res.ok).toBe(true);
    const buf = new Uint8Array(await (res as Response).arrayBuffer());
    expect([...buf]).toEqual([42, 42]);
  });

  it("throws if Kapso proxy used without phoneNumberId (download)", async () => {
    const { fetchMock } = setupFetch([
      // Should not reach a fetch for metadata because we will throw before
      () => new Response("should-not-be-called", { status: 500 })
    ]);
    const client = new WhatsAppClient({ kapsoApiKey: "kapso", baseUrl: "https://app.kapso.ai/api/meta", fetch: fetchMock });
    await expect(client.media.download({ mediaId: "MEDIA_ID" })).rejects.toThrowError(
      "phoneNumberId is required when using the Kapso proxy"
    );
  });
});
