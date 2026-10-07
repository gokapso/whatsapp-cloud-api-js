import { describe, expect, expectTypeOf, it } from "vitest";
import { GraphApiError, KapsoProxyRequiredError, WhatsAppClient } from "../src";
import type { WhatsAppClientConfig } from "../src";

const callUuid = "a29edbfe-f181-4a10-b3b0-0d2bb66e390b";
const setup = (response: () => Response, config: Partial<WhatsAppClientConfig> = {}) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return response();
  };
  const client = new WhatsAppClient({ baseUrl: "https://api.kapso.ai/meta/whatsapp", kapsoApiKey: "key", ...config, fetch: fetchMock });
  return { client, calls };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Kapso native call artifacts", () => {
  it("camelizes the backend detail envelope and typed availability metadata", async () => {
    const { client, calls } = setup(() => json({ data: {
      id: callUuid, call_id: "wacid.META", business_scoped_user_id: "US.1", user_wa_id: null,
      artifacts: {
        recording: { state: "available", media_id: "111", mime_type: "audio/ogg", sha256: "hash", received_at: "2026-10-06T12:00:00Z",
          expires_at: "2026-10-13T12:00:00Z", fetch_path: `/api/v1/whatsapp_calls/${callUuid}/artifacts/recording` },
        transcription: { state: "absent" }
      }
    } }), { accessToken: "meta-secret" });
    const detail = await client.calls.details({ callUuid });
    expect(calls).toEqual([{ url: `https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}`,
      init: { method: "GET", headers: { "X-API-Key": "key" }, redirect: "error" } }]);
    expect(detail.data).toMatchObject({ id: callUuid, callId: "wacid.META", businessScopedUserId: "US.1",
      artifacts: { recording: { state: "available", mediaId: "111", mimeType: "audio/ogg", receivedAt: "2026-10-06T12:00:00Z",
        expiresAt: "2026-10-13T12:00:00Z", fetchPath: `/api/v1/whatsapp_calls/${callUuid}/artifacts/recording` }, transcription: { state: "absent" } } });
    expectTypeOf(detail.data.artifacts.recording.mediaId).toEqualTypeOf<string | undefined>();
  });

  it("supports an explicit custom app origin while retaining key-only auth", async () => {
    const { client, calls } = setup(() => json({ data: {} }), { baseUrl: "https://proxy.example.test/meta", kapsoAppBaseUrl: "https://app.example.test/", accessToken: "meta-secret" });
    await client.calls.details({ callUuid });
    expect(calls[0]?.url).toBe(`https://app.example.test/api/v1/whatsapp_calls/${callUuid}`);
    expect(calls[0]?.init?.headers).toEqual({ "X-API-Key": "key" });
  });

  it("defaults to the Kapso app origin for a key-only client", async () => {
    const { client, calls } = setup(() => json({ data: {} }), { baseUrl: undefined });
    await client.calls.details({ callUuid });
    expect(calls[0]?.url).toBe(`https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}`);
  });

  it("requires an explicit app origin for custom proxy hosts", async () => {
    const { client, calls } = setup(() => json({}), { baseUrl: "https://proxy.example.test/meta" });
    await expect(client.calls.details({ callUuid })).rejects.toThrow(/kapsoAppBaseUrl/);
    expect(calls).toHaveLength(0);
  });

  it.each(["http://app.example.test", "https://user:secret@app.example.test", "https://app.example.test/api", "https://app.example.test/?query=1", "https://app.example.test/#fragment", "not a URL"])("rejects unsafe app base %s before fetch", async (kapsoAppBaseUrl) => {
    const { client, calls } = setup(() => json({}), { kapsoAppBaseUrl });
    await expect(client.calls.details({ callUuid })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it.each(["https://graph.facebook.com", "https://api.kapso.ai/meta/whatsapp"])("rejects Meta-only auth at %s before fetch", async (baseUrl) => {
    const { client, calls } = setup(() => json({}), { accessToken: "token", kapsoApiKey: undefined, baseUrl });
    await expect(client.calls.details({ callUuid })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    await expect(client.calls.fetchArtifact({ callUuid, kind: "recording" })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    expect(calls).toHaveLength(0);
  });

  it.each(["wacid.META", "not-a-uuid", `${callUuid}/../../secrets`, "https://attacker.example/", ""])("rejects non-local callUuid %s", async (invalid) => {
    const { client, calls } = setup(() => json({}));
    await expect(client.calls.details({ callUuid: invalid })).rejects.toThrow(/Kapso local UUID.*calls.get/);
    await expect(client.calls.fetchArtifact({ callUuid: invalid, kind: "recording" })).rejects.toThrow(/Kapso local UUID/);
    expect(calls).toHaveLength(0);
  });

  it("validates artifact kind and download before fetch", async () => {
    const { client, calls } = setup(() => json({}));
    for (const input of [{ callUuid }, { callUuid, kind: "audio" }, { callUuid, kind: "recording", download: "true" }]) {
      await expect(client.calls.fetchArtifact(input as never)).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
  });

  it.each(["recording", "transcription"] as const)("returns raw %s bytes without buffering or adding Range/auth bearer headers", async (kind) => {
    const bytes = new Uint8Array([0, 255, 128, 13, 10, 1]);
    const response = new Response(bytes, { headers: { "content-type": kind === "recording" ? "audio/ogg" : "application/json" } });
    const { client, calls } = setup(() => response, { accessToken: "meta-secret" });
    const result = await client.calls.fetchArtifact({ callUuid, kind });
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(calls[0]?.url).toBe(`https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}/artifacts/${kind}`);
    expect(calls[0]?.init).toEqual({ method: "GET", headers: { "X-API-Key": "key" }, redirect: "error" });
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  });

  it("returns transcript preview JSON untouched and sends download=true only when requested", async () => {
    const preview = { data: { state: "available", text: "Hello", language: "en", duration: 2.3,
      segments: [{ id: 1, speaker: "Business", channel: 0, start: 0, end: 2, text: "Hello" }], truncated: false } };
    const { client, calls } = setup(() => json(preview));
    const response = await client.calls.fetchArtifact({ callUuid, kind: "transcription", download: false });
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(preview);
    await client.calls.fetchArtifact({ callUuid, kind: "transcription", download: true });
    await client.calls.fetchArtifact({ callUuid, kind: "recording", download: true });
    expect(calls.map(call => call.url)).toEqual([
      `https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}/artifacts/transcription`,
      `https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}/artifacts/transcription?download=true`,
      `https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}/artifacts/recording?download=true`
    ]);
  });

  it.each([
    [404, "artifact_unavailable"], [410, "artifact_expired"], [413, "artifact_too_large"],
    [422, "artifact_invalid_transcript"], [502, "artifact_download_failed"]
  ] as const)("preserves structured backend %s/%s without widening numeric GraphApiError.code", async (status, apiCode) => {
    const payload = { error: { code: apiCode, message: "Call artifact could not be retrieved" }, artifact: { kind: "recording", state: apiCode.slice(9) } };
    const { client } = setup(() => json(payload, status));
    try {
      await client.calls.fetchArtifact({ callUuid, kind: "recording" });
      throw new Error("Expected HTTP error");
    } catch (error) {
      expect(error).toBeInstanceOf(GraphApiError);
      const apiError = error as GraphApiError;
      expect(apiError).toMatchObject({ code: status, httpStatus: status, apiCode, message: payload.error.message, raw: payload });
      expect(apiError.toJSON()).toMatchObject({ code: status, apiCode });
      expectTypeOf(apiError.code).toEqualTypeOf<number>();
    }
    await expect(client.calls.details({ callUuid })).rejects.toMatchObject({ code: status, apiCode });
  });

  it("preserves missing-call errors and non-JSON errors", async () => {
    const missing = setup(() => json({ error: "Call not found" }, 404));
    await expect(missing.client.calls.details({ callUuid })).rejects.toMatchObject({ httpStatus: 404, code: 404, message: "Call not found" });
    const gateway = setup(() => new Response("Bad Gateway", { status: 502 }));
    await expect(gateway.client.calls.fetchArtifact({ callUuid, kind: "recording" })).rejects.toMatchObject({ code: 502, httpStatus: 502 });
  });

  it("rejects redirects and never requests an off-host location", async () => {
    const { client, calls } = setup(() => new Response(null, { status: 302, headers: { location: "https://attacker.example/media" } }));
    await expect(client.calls.fetchArtifact({ callUuid, kind: "recording" })).rejects.toBeInstanceOf(GraphApiError);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe("error");
    expect(calls[0]?.url).toContain("https://app.kapso.ai/");
  });

  it("constructs its own artifact URL instead of using webhook/summary URLs", async () => {
    const { client, calls } = setup(() => json({}));
    await client.calls.fetchArtifact({ callUuid, kind: "recording", url: "https://attacker.example", fetchPath: "//attacker.example", headers: { Range: "bytes=0-10" } } as never);
    expect(calls[0]?.url).toBe(`https://app.kapso.ai/api/v1/whatsapp_calls/${callUuid}/artifacts/recording`);
    expect(calls[0]?.init?.headers).toEqual({ "X-API-Key": "key" });
  });
});
