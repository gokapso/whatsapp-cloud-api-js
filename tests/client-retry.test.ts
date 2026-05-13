import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhatsAppClient, GraphApiError } from "../src";

describe("WhatsAppClient retry behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries successfully after transient server errors", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 3 }
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("respects server-provided retryAfterMs", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Rate limit hit",
              type: "OAuthException",
              code: 130429
            }
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "2" // 2 seconds = 2000ms
            }
          }
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 3 }
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    // Advance time by 2000ms (the retry-after delay)
    vi.advanceTimersByTime(2000);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry errors with do_not_retry action", async () => {
    const fetchMock: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "(#131047) Re-engagement message",
            type: "OAuthException",
            code: 131047,
            error_data: {
              messaging_product: "whatsapp",
              details: "Customer outside 24 hour window"
            }
          }
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 3 }
    });

    await expect(async () => {
      await client.request("GET", "test", { responseType: "json" });
    }).rejects.toThrow();

    // Should only attempt once, no retries
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry authorization errors requiring token refresh", async () => {
    const fetchMock: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid OAuth access token",
            type: "OAuthException",
            code: 190
          }
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 3 }
    });

    await expect(async () => {
      await client.request("GET", "test", { responseType: "json" });
    }).rejects.toThrow();

    // Should only attempt once, no retries for auth errors
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff with jitter for retries", async () => {
    let attemptCount = 0;
    const callTimes: number[] = [];
    const fetchMock: typeof fetch = vi.fn(async () => {
      callTimes.push(Date.now());
      attemptCount++;
      if (attemptCount < 3) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000
      }
    });

    const startTime = Date.now();
    const promise = client.request("GET", "test", { responseType: "json" });

    // Advance time to allow retries
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Verify delays between calls (should be exponential with jitter)
    if (callTimes.length >= 2) {
      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];
      // First delay should be around 1000ms (with jitter)
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(2000);
      // Second delay should be around 2000ms (exponential, with jitter)
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(4000);
    }
  });

  it("respects maxAttempts limit", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      return new Response("Internal Server Error", { status: 500 });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 2 }
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
    // Should attempt exactly maxAttempts times
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when retry is disabled", async () => {
    const fetchMock: typeof fetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { enabled: false }
    });

    await expect(async () => {
      await client.request("GET", "test", { responseType: "json" });
    }).rejects.toThrow();

    // Should only attempt once when retry is disabled
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-GraphApiError errors", async () => {
    const fetchMock: typeof fetch = vi.fn(async () => {
      throw new Error("Network error");
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: { maxAttempts: 3 }
    });

    await expect(async () => {
      await client.request("GET", "test", { responseType: "json" });
    }).rejects.toThrow("Network error");

    // Should only attempt once for non-GraphApiError
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 502 Bad Gateway errors", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return new Response("Bad Gateway", { status: 502 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 504 Gateway Timeout errors", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return new Response("Gateway Timeout", { status: 504 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("works with custom retry configuration", async () => {
    let attemptCount = 0;
    const fetchMock: typeof fetch = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock,
      retry: {
        maxAttempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        retryableStatuses: [503, 504]
      }
    });

    const promise = client.request("GET", "test", { responseType: "json" });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves request body across retries", async () => {
    let attemptCount = 0;
    const requestBodies: unknown[] = [];
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      attemptCount++;
      requestBodies.push(init?.body);
      if (attemptCount < 2) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const client = new WhatsAppClient({
      accessToken: "token",
      fetch: fetchMock
    });

    const requestBody = { message: "test", to: "+1234567890" };
    const promise = client.request("POST", "test", {
      body: requestBody,
      responseType: "json"
    });

    await vi.runAllTimersAsync();

    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Verify body is preserved across retries
    expect(requestBodies[0]).toBe(requestBodies[1]);
  });
});
