import { describe, expect, it, vi } from "vitest";
import { WhatsAppClient } from "../src";

const modes = [
  { accessToken: "dummy-meta" },
  { kapsoApiKey: "dummy-kapso", baseUrl: "https://api.kapso.ai/meta/whatsapp" }
];
const unsafe = ["https://external.example/media", "https:external.example", "//external.example/x", "\\\\external.example/x", "../x", "%2e%2e/x", "a?x=1", "a#fragment", "\nhttps://external.example", "a/b", "a%2fb"];

describe.each(modes)("resource boundaries %j", config => {
  it.each(unsafe)("rejects unsafe media ID %j before transport", async mediaId => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = new WhatsAppClient({ ...config, fetch: fetchMock });
    for (const method of ["get", "delete", "download"] as const) {
      await expect(client.media[method]({ mediaId, phoneNumberId: "123" })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["123456789", "MEDIA_ID", "550e8400-e29b-41d4-a716-446655440000"])("keeps valid ID %s scoped", async mediaId => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ success: true }));
    const client = new WhatsAppClient({ ...config, fetch: fetchMock });
    await client.media.get({ mediaId, phoneNumberId: "123" });
    await client.media.delete({ mediaId, phoneNumberId: "123" });
    for (const [url, init] of fetchMock.mock.calls) {
      expect(new URL(String(url)).origin).toBe(config.baseUrl ? "https://api.kapso.ai" : "https://graph.facebook.com");
      expect(init?.redirect).toBe("error");
    }
  });
  it.each(["https://external.example", "https://graph.facebook.com/v23.0/id", "\\\\external.example/x", "../outside", "%2e%2e/outside", "\thttps://external.example"])("guards direct resource request %j", async path => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = new WhatsAppClient({ ...config, fetch: fetchMock });
    await expect(client.request("GET", path)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it.each(["https://kapso.ai", "https://api.kapso.ai", "https://notkapso.ai", "https://kapso.ai.external.example"])("uses DNS boundaries for proxy detection: %s", baseUrl => {
  const client = new WhatsAppClient({ accessToken: "dummy", baseUrl, fetch: vi.fn() });
  expect(client.isKapsoProxy()).toBe(["https://kapso.ai", "https://api.kapso.ai"].includes(baseUrl));
});

it.each(["https://notkapso.ai/file", "https://kapso.ai.external.example/file", "https://kapso.ai/file", "https://cdn.kapso.ai/file"])("scopes media auto auth: %s", async target => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url: target })).mockResolvedValueOnce(new Response("ok"));
  const client = new WhatsAppClient({ kapsoApiKey: "dummy", fetch: fetchMock });
  await client.media.download({ mediaId: "123", phoneNumberId: "456" });
  const init = fetchMock.mock.calls[1][1];
  const trusted = ["kapso.ai", "cdn.kapso.ai"].includes(new URL(target).hostname);
  expect(new Headers(init?.headers).has("X-API-Key")).toBe(trusted);
  if (trusted) expect(init?.redirect).toBe("error");
});

it.each(["http://cdn.kapso.ai/file", "file:///etc/passwd", "https://user:pass@cdn.kapso.ai/file"])("rejects unsafe download URL %s", async url => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url }));
  const client = new WhatsAppClient({ accessToken: "dummy", fetch: fetchMock });
  await expect(client.media.download({ mediaId: "123" })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([undefined, "blob", "response"] as const)("handles HTTP errors for mode %s", async as => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url: "https://cdn.example/file" }))
    .mockResolvedValueOnce(new Response("<h1>Unavailable</h1>", { status: 503, headers: { "Content-Type": "text/html" } }));
  const client = new WhatsAppClient({ accessToken: "dummy", fetch: fetchMock });
  const download = client.media.download({ mediaId: "123", as });
  if (as === "response") {
    const response = await download as Response;
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("<h1>Unavailable</h1>");
  } else await expect(download).rejects.toMatchObject({ httpStatus: 503 });
});

it.each(["auto", "never"] as const)("rejects redirects even for unauthenticated downloads with custom headers: %s", async auth => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url: "https://cdn.example/file" })).mockResolvedValueOnce(new Response("ok"));
  const client = new WhatsAppClient({ accessToken: "dummy", fetch: fetchMock });
  await client.media.download({ mediaId: "123", auth, headers: { "X-Custom-Secret": "dummy-custom-secret" } });
  const init = fetchMock.mock.calls[1][1];
  expect(init?.redirect).toBe("error");
  expect(new Headers(init?.headers).get("X-Custom-Secret")).toBe("dummy-custom-secret");
  expect(new Headers(init?.headers).has("Authorization")).toBe(false);
});

it("preserves explicit low-level absolute fetch and rawFetch redirect choices", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response("ok"));
  const client = new WhatsAppClient({ kapsoApiKey: "dummy", fetch: fetchMock });
  await client.fetch("https://trusted.example/file", { redirect: "manual" });
  await client.rawFetch("https://trusted.example/file", { redirect: "follow" });
  expect(fetchMock.mock.calls[0]).toEqual(["https://trusted.example/file", { redirect: "manual", headers: { "X-API-Key": "dummy" } }]);
  expect(fetchMock.mock.calls[1]).toEqual(["https://trusted.example/file", { redirect: "follow" }]);
});
