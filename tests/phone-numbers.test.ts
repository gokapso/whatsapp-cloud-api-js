import { describe, expect, expectTypeOf, it } from "vitest";
import { WhatsAppClient } from "../src";

describe("Phone Numbers API", () => {
  const setupFetch = (payload: unknown = { success: true }) => {
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

  it("requestCode posts code_method and language", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const first = await client.phoneNumbers.requestCode({ phoneNumberId: "123", codeMethod: "SMS", language: "en_US" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/request_code");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ code_method: "SMS", language: "en_US" });
    expect(first).toEqual({ success: true });
    expectTypeOf(first).not.toBeAny();
    expectTypeOf(first).toEqualTypeOf<{ success: true }>();
  });

  it("verifyCode posts code", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.verifyCode({ phoneNumberId: "123", code: "123456" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/verify_code");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ code: "123456" });
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });

  it("register posts messaging_product and pin", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.register({ phoneNumberId: "123", pin: "000111" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/register");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ messaging_product: "whatsapp", pin: "000111" });
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });

  it("deregister posts to deregister", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.deregister({ phoneNumberId: "123" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/deregister");
    expect(calls[0]?.init.method).toBe("POST");
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });

  it("settings.get fetches settings with calling payload", async () => {
    const { fetchMock, calls } = setupFetch({
      fallback_language: "en_US",
      calling: {
        status: "ENABLED",
        call_icon_visibility: "DEFAULT",
        call_hours: {
          status: "ENABLED",
          timezone_id: "America/Manaus",
          weekly_operating_hours: [
            { day_of_week: "MONDAY", open_time: "0400", close_time: "1020" }
          ]
        }
      }
    });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const res = await client.phoneNumbers.settings.get({ phoneNumberId: "123" });
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/settings");
    expect(res).toMatchObject({ fallbackLanguage: "en_US", calling: { status: "ENABLED" } });
    expect(res.calling?.callHours?.weeklyOperatingHours?.[0]?.dayOfWeek).toBe("MONDAY");
    expectTypeOf(res).not.toBeAny();
    expectTypeOf(res.calling?.callHours?.weeklyOperatingHours?.[0]?.openTime).toMatchTypeOf<string | undefined>();
  });

  it("settings.update posts calling configuration", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.settings.update({
      phoneNumberId: "123",
      calling: {
        status: "ENABLED",
        callIconVisibility: "DEFAULT",
        callHours: {
          status: "ENABLED",
          timezoneId: "America/Manaus",
          weeklyOperatingHours: [{ dayOfWeek: "TUESDAY", openTime: "0108", closeTime: "1020" }]
        },
        callbackPermissionStatus: "ENABLED",
        sip: {
          status: "ENABLED",
          servers: [{ hostname: "sip.example.com", port: 5060, requestUriUserParams: { KEY1: "VALUE1" } }]
        }
      }
    });
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/settings");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      calling: {
        status: "ENABLED",
        call_icon_visibility: "DEFAULT",
        call_hours: {
          weekly_operating_hours: [
            { day_of_week: "TUESDAY", open_time: "0108", close_time: "1020" }
          ]
        },
        callback_permission_status: "ENABLED",
        sip: {
          servers: [
            {
              hostname: "sip.example.com",
              port: 5060,
              request_uri_user_params: { KEY1: "VALUE1" }
            }
          ]
        }
      }
    });
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });

  it("businessProfile.get issues GET", async () => {
    const { fetchMock, calls } = setupFetch({ data: [{ about: "ABOUT" }] });
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.businessProfile.get({ phoneNumberId: "123" });
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/whatsapp_business_profile");
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<{ data: Array<Record<string, unknown>> }>();
  });

  it("businessProfile.update posts messaging_product plus fields", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.phoneNumbers.businessProfile.update({ phoneNumberId: "123", about: "ABOUT", email: "x@y.z", websites: ["https://ex.com"], vertical: "INDUSTRY" });

    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/123/whatsapp_business_profile");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ messaging_product: "whatsapp", about: "ABOUT", email: "x@y.z" });
    expect(result).toEqual({ success: true });
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toEqualTypeOf<{ success: true }>();
  });
});
