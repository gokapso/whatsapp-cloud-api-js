import { describe, expect, it } from "vitest";
import { WhatsAppClient, GraphApiError } from "../src";

describe("GraphApiError", () => {
  const buildClient = (factory: () => Response) => {
    const fetchMock: typeof fetch = async () => factory();
    return new WhatsAppClient({ accessToken: "token", fetch: fetchMock });
  };

  it("normalizes Graph API error payloads to camelCase with category and retry hints", async () => {
    const errorPayload = {
      error: {
        message: "(#131047) Re-engagement message",
        type: "OAuthException",
        code: 131047,
        error_subcode: 999001,
        error_data: {
          messaging_product: "whatsapp",
          details: "Customer outside 24 hour window"
        },
        fbtrace_id: "TRACE123"
      }
    };

    const client = buildClient(() =>
      new Response(JSON.stringify(errorPayload), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );

    let caught: unknown;
    try {
      await client.messages.sendText({
        phoneNumberId: "123",
        to: "15551234567",
        body: "Hello"
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GraphApiError);
    const graphError = caught as GraphApiError;
    expect(graphError.httpStatus).toBe(400);
    expect(graphError.code).toBe(131047);
    expect(graphError.type).toBe("OAuthException");
    expect(graphError.errorSubcode).toBe(999001);
    expect(graphError.fbtraceId).toBe("TRACE123");
    expect(graphError.details).toBe("Customer outside 24 hour window");
    expect(graphError.errorData?.messagingProduct).toBe("whatsapp");
    expect(graphError.category).toBe("reengagementWindow");
    expect(graphError.retry.action).toBe("do_not_retry");
    expect(graphError.retry.retryAfterMs).toBeUndefined();
    expect(graphError.message).toContain("Re-engagement message");
    expect(graphError.raw).toEqual({
      error: {
        message: "(#131047) Re-engagement message",
        type: "OAuthException",
        code: 131047,
        errorSubcode: 999001,
        errorData: {
          messagingProduct: "whatsapp",
          details: "Customer outside 24 hour window"
        },
        fbtraceId: "TRACE123"
      }
    });
  });

  it("extracts retry-after header for rate limit errors", async () => {
    const errorPayload = {
      error: {
        message: "(#130429) Rate limit hit",
        type: "OAuthException",
        code: 130429,
        error_data: {
          messaging_product: "whatsapp",
          details: "Cloud API message throughput has been reached."
        }
      }
    };

    const client = buildClient(() =>
      new Response(JSON.stringify(errorPayload), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "120"
        }
      })
    );

    let caught: unknown;
    try {
      await client.messages.sendText({
        phoneNumberId: "123",
        to: "15551234567",
        body: "Hello"
      });
    } catch (error) {
      caught = error;
    }

    const graphError = caught as GraphApiError;
    expect(graphError.retry.action).toBe("retry_after");
    expect(graphError.retry.retryAfterMs).toBe(120_000);
    expect(graphError.category).toBe("throttling");
    expect(graphError.isRateLimit()).toBe(true);
  });

  it("handles non-JSON error bodies and defaults to server category", async () => {
    const client = buildClient(() => new Response("Bad Gateway", { status: 502 }));

    await expect(async () => {
      await client.messages.sendText({
        phoneNumberId: "123",
        to: "15551234567",
        body: "Hello"
      });
    }).rejects.toMatchObject({
      category: "server",
      retry: { action: "retry" }
    });
  });

  it("normalizes Kapso proxy error envelopes", async () => {
    const client = buildClient(() =>
      new Response(JSON.stringify({ error: "Kapso proxy timeout" }), {
        status: 504,
        headers: { "Content-Type": "application/json" }
      })
    );

    let caught: unknown;
    try {
      await client.messages.sendText({
        phoneNumberId: "123",
        to: "15551234567",
        body: "Hello"
      });
    } catch (error) {
      caught = error;
    }

    const graphError = caught as GraphApiError;
    expect(graphError.message).toContain("Kapso proxy timeout");
    expect(graphError.category).toBe("server");
    expect(graphError.retry.action).toBe("retry");
  });
});
