import { describe, expect, expectTypeOf, it } from "vitest";
import { WhatsAppClient } from "../src";
import type { TemplateCreateResponse, TemplateDeleteResponse, TemplateListResponse } from "../src";

const sampleListResponse: TemplateListResponse = {
  data: [
    {
      id: "564750795574598",
      name: "order_confirmation",
      category: "UTILITY",
      language: "en_US",
      status: "APPROVED",
      components: [],
      quality_score_category: "GREEN"
    }
  ],
  paging: { cursors: { before: "", after: "" } }
};

describe("Templates resource", () => {
  const setupFetch = (payload: unknown = sampleListResponse) => {
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

  it("lists message templates with query params", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const templates = await client.templates.list({
      businessAccountId: "102290129340398",
      status: "APPROVED"
    });

    expect(templates).toEqual(sampleListResponse);
    expectTypeOf(templates).not.toBeAny();
    expectTypeOf(templates).toMatchTypeOf<TemplateListResponse>();
    expect(calls[0]?.url).toBe(
      "https://graph.facebook.com/v23.0/102290129340398/message_templates?status=APPROVED"
    );
  });

  it("creates a template and validates payload", async () => {
    const createResponse: TemplateCreateResponse = { id: "12345", status: "PENDING", category: "MARKETING" };
    const { fetchMock, calls } = setupFetch(createResponse);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const created = await client.templates.create({
      businessAccountId: "102290129340398",
      name: "seasonal_promotion",
      language: "en_US",
      category: "MARKETING",
      components: [
        {
          type: "HEADER",
          format: "TEXT",
          text: "Our {{1}} is on!",
          example: { header_text: ["Summer Sale"] }
        },
        {
          type: "BODY",
          text: "Shop now through {{1}} and use code {{2}} to get {{3}} off of all merchandise.",
          example: { body_text: [["the end of August", "25OFF", "25%"]] }
        }
      ]
    });

    expect(created).toEqual(createResponse);
    expectTypeOf(created).not.toBeAny();
    expectTypeOf(created).toMatchTypeOf<TemplateCreateResponse>();
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({
      name: "seasonal_promotion",
      language: "en_US",
      category: "MARKETING",
      components: expect.any(Array)
    });
  });

  it("deletes a template and returns result", async () => {
    const deleteResponse: TemplateDeleteResponse = { success: true };
    const { fetchMock, calls } = setupFetch(deleteResponse);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.templates.delete({
      businessAccountId: "102290129340398",
      name: "seasonal_promotion",
      language: "en_US"
    });

    expect(result).toEqual(deleteResponse);
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<TemplateDeleteResponse>();
    expect(calls[0]?.url).toBe(
      "https://graph.facebook.com/v23.0/102290129340398/message_templates?name=seasonal_promotion&language=en_US"
    );
    expect(calls[0]?.init.method).toBe("DELETE");
  });
});
