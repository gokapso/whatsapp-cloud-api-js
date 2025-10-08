import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src";

describe("Contacts API", () => {
  const setupFetch = (payload: unknown) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };
    return { fetchMock, calls } as const;
  };

  it("lists contacts with filters", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [
        {
          id: "contact-1",
          wa_id: "56911112222",
          profile_name: "Alice",
          customer_id: "customer-1"
        }
      ],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.contacts.list({
      phoneNumberId: "123",
      hasCustomer: true,
      customerId: "00000000-0000-0000-0000-000000000000",
      limit: 50
    });

    expect(calls[0]?.url).toContain("https://graph.facebook.com/v23.0/123/contacts?");
    expect(calls[0]?.url).toContain("has_customer=true");
    expect(calls[0]?.url).toContain("customer_id=00000000-0000-0000-0000-000000000000");
    expect(result.data[0]).toMatchObject({ id: "contact-1", waId: "56911112222" });
    expect(result.data[0].customerId).toBe("customer-1");
    expect(result.paging.cursors.after).toBeNull();
  });

  it("lists contacts for a specific customer without hasCustomer flag", async () => {
    const { fetchMock, calls } = setupFetch({
      data: [],
      paging: { cursors: { before: null, after: null }, next: null, previous: null }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const customerId = "123e4567-e89b-12d3-a456-426614174000";

    await client.contacts.list({
      phoneNumberId: "123",
      customerId
    });

    const url = calls[0]?.url ?? "";
    expect(url).toContain(`customer_id=${encodeURIComponent(customerId)}`);
    expect(url).not.toContain("has_customer=");
  });

  it("loads a single contact", async () => {
    const { fetchMock, calls } = setupFetch({
      data: {
        id: "contact-1",
        wa_id: "56911112222",
        profile_name: "Alice",
        metadata: { tags: ["vip"] }
      }
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const contact = await client.contacts.get({ phoneNumberId: "123", waId: "56911112222" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/contacts/56911112222");
    expect(contact).toMatchObject({ profileName: "Alice" });
    expect(contact.metadata?.tags).toEqual(["vip"]);
  });

  it("loads a contact when response is bare object", async () => {
    const { fetchMock } = setupFetch({
      id: "contact-2",
      wa_id: "56922223333",
      profile_name: "Bob"
    });

    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const contact = await client.contacts.get({ phoneNumberId: "123", waId: "56922223333" });

    expect(contact).toMatchObject({ id: "contact-2", profileName: "Bob" });
  });

  it("updates contact metadata", async () => {
    const { fetchMock, calls } = setupFetch({ success: true });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const response = await client.contacts.update({
      phoneNumberId: "123",
      waId: "56911112222",
      profileName: "Alice",
      metadata: { tags: ["vip"], source: "import" }
    });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/contacts/56911112222");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      profile_name: "Alice",
      metadata: { tags: ["vip"], source: "import" }
    });
    expect(response).toEqual({ success: true });
  });

  it("rejects updates when no fields provided", async () => {
    const { fetchMock } = setupFetch({ success: true });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await expect(
      client.contacts.update({ phoneNumberId: "123", waId: "56911112222" })
    ).rejects.toThrow(/At least one field/);
  });
});
