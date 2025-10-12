import { describe, expect, it, vi, beforeEach } from "vitest";
import { WhatsAppClient } from "../src";
import { toFlowJsonWireCase, computeFlowJsonHash, __setHashImplementation } from "../src/utils/flow-json";

const SAMPLE_FLOW = {
  version: "7.2",
  screens: [
    {
      id: "ONE",
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Footer",
            label: "Continue",
            onClickAction: { name: "complete", payload: {} },
            leftCaption: "Left"
          }
        ]
      }
    }
  ]
} as const;

describe("Flows resource", () => {
  beforeEach(() => {
    __setHashImplementation(undefined);
  });

  const setupFetch = (responses: Array<{ status?: number; body?: unknown }> = []) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let index = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: (init ?? {}) as RequestInit });
      const { status = 200, body } = responses[Math.min(index, responses.length - 1)] ?? {};
      index += 1;
      if (body === undefined) {
        return new Response(undefined, { status });
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
      });
    };

    return { fetchMock, calls } as const;
  };

  it("creates a flow with camelCase payload and default category", async () => {
    const { fetchMock, calls } = setupFetch([{ body: { id: "123", success: true } }]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.flows.create({
      wabaId: "WABA",
      name: "test-flow",
      flowJson: SAMPLE_FLOW,
      publish: true,
      endpointUri: "https://example.com/flows/test"
    });

    expect(result).toEqual({ id: "123", success: true, validationErrors: undefined });
    const call = calls[0];
    expect(call?.url).toBe("https://graph.facebook.com/v23.0/WABA/flows");
    const parsedBody = JSON.parse(String(call?.init.body));
    expect(parsedBody).toMatchObject({
      name: "test-flow",
      publish: true,
      endpoint_uri: "https://example.com/flows/test",
      categories: ["OTHER"]
    });
    expect(parsedBody.flow_json).toBe(JSON.stringify(toFlowJsonWireCase(SAMPLE_FLOW)));
  });

  it("surfaces validation errors with camelCase hints", async () => {
    const graphResponse = {
      id: "123",
      success: false,
      validation_errors: [
        {
          error: "INVALID_PROPERTY_VALUE",
          error_type: "FLOW_JSON_ERROR",
          message: "Invalid value for property",
          pointers: [
            {
              path: "screens[0].layout.children[0].on-click-action",
              line_start: 10,
              column_start: 5
            }
          ]
        }
      ]
    };
    const { fetchMock } = setupFetch([{ body: graphResponse }]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.flows.create({
      wabaId: "WABA",
      name: "test-flow",
      flowJson: SAMPLE_FLOW
    });

    expect(result.validationErrors).toEqual([
      expect.objectContaining({
        error: "INVALID_PROPERTY_VALUE",
        errorType: "FLOW_JSON_ERROR",
        hint: "Use onClickAction (camelCase). We map it to on-click-action.",
        pointers: [expect.objectContaining({ path: "screens[0].layout.children[0].on-click-action", lineStart: 10, columnStart: 5 })]
      })
    ]);
  });

  it("uploads flow.json asset when updateAsset receives json", async () => {
    const { fetchMock, calls } = setupFetch([{ body: { success: true } }]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const result = await client.flows.updateAsset({ flowId: "FLOW", json: SAMPLE_FLOW });
    expect(result).toEqual({ success: true, validationErrors: undefined });

    const call = calls[0];
    expect(call?.url).toBe("https://graph.facebook.com/v23.0/FLOW/assets");
    const form = call?.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);

    let fileValue: FormDataEntryValue | undefined;
    form.forEach((value, key) => {
      if (key === "file" && fileValue === undefined) {
        fileValue = value;
      }
    });

    expect(fileValue).toBeDefined();
    const text = typeof fileValue === "string" ? fileValue : await (fileValue as File).text();
    expect(JSON.parse(text)).toEqual(toFlowJsonWireCase(SAMPLE_FLOW));
  });

  it("preview uses interactive flag and camelizes response", async () => {
    const { fetchMock, calls } = setupFetch([
      { body: { preview: { preview_url: "https://preview", expires_at: "2025-01-01" } } },
      { body: { preview: { previewUrl: "https://preview2", expiresAt: "2025-01-02" } } }
    ]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const first = await client.flows.preview({ flowId: "FLOW", interactive: false });
    expect(first.preview.previewUrl).toBe("https://preview");
    const firstCall = new URL(calls[0]!.url);
    expect(firstCall.searchParams.get("fields")).toBe("preview");

    const second = await client.flows.preview({ flowId: "FLOW", interactive: true });
    expect(second.preview.previewUrl).toBe("https://preview2");
    const secondCall = new URL(calls[1]!.url);
    expect(secondCall.searchParams.get("fields")).toBe("preview.invalidate(false)");
  });

  it("deploy uses provided flowId and hash cache", async () => {
    const { fetchMock, calls } = setupFetch();
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    const hash = computeFlowJsonHash(SAMPLE_FLOW);
    client.flows.__setLastDeployedHash({ name: "test-flow", wabaId: "WABA", hash });

    const result = await client.flows.deploy(SAMPLE_FLOW, {
      name: "test-flow",
      wabaId: "WABA",
      flowId: "FLOW",
      publish: true
    });

    expect(result.flowId).toBe("FLOW");
    // Only publish call should be executed
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/FLOW/publish");
  });

  it("deploy forces asset upload when hash differs or forceAssetUpload is true", async () => {
    const { fetchMock, calls } = setupFetch([
      { body: { success: true } },
      { body: { success: true } }
    ]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.deploy({ version: "7.2", screens: [] }, {
      name: "test-flow",
      wabaId: "WABA",
      flowId: "FLOW",
      forceAssetUpload: true
    });

    const assetCall = calls.find((c) => c.url.includes("/FLOW/assets"));
    expect(assetCall).toBeDefined();
  });

  it("deploy supports preview options object", async () => {
    const { fetchMock, calls } = setupFetch([
      { body: { id: "FLOW", success: true } },
      { body: { preview: { preview_url: "https://preview", expires_at: "2025-01-01" } } }
    ]);
    const client = new WhatsAppClient({ accessToken: "token", fetch: fetchMock });

    await client.flows.deploy(SAMPLE_FLOW, {
      name: "test-flow",
      wabaId: "WABA",
      preview: { interactive: true, params: { flowAction: "navigate" } }
    });

    const previewRequest = calls.at(-1)!;
    const url = new URL(previewRequest.url);
    expect(url.searchParams.get("fields")).toBe("preview.invalidate(false)");
    expect(url.searchParams.get("flow_action")).toBe("navigate");
  });
});
