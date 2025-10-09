import { describe, it, expect } from "vitest";
import { WhatsAppClient, KapsoProxyRequiredError } from "../src";

describe("Kapso proxy guards", () => {
  const fetchMock: typeof fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });

  it("throws helpful error for conversations when not on Kapso", async () => {
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await expect(client.conversations.list({ phoneNumberId: "123" as string })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    await expect(client.conversations.get({ conversationId: "conv-1" })).rejects.toThrow(/kapso\.ai/);
  });

  it("throws helpful error for message history when not on Kapso", async () => {
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await expect(client.messages.query({ phoneNumberId: "123" })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    await expect(client.messages.listByConversation({ phoneNumberId: "123", conversationId: "conv-1" })).rejects.toThrow(/Kapso Proxy/);
  });

  it("throws helpful error for contacts when not on Kapso", async () => {
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await expect(client.contacts.list({ phoneNumberId: "123" })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    await expect(client.contacts.get({ phoneNumberId: "123", waId: "15551234567" })).rejects.toThrow(/https:\/\/kapso\.ai\//);
  });

  it("throws helpful error for call history when not on Kapso", async () => {
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
    await expect(client.calls.list({ phoneNumberId: "123" })).rejects.toBeInstanceOf(KapsoProxyRequiredError);
    await expect(client.calls.get({ phoneNumberId: "123", callId: "wacid.123" })).rejects.toThrow(/Kapso Proxy/);
  });
});
