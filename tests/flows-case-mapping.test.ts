import { describe, expect, it, afterEach } from "vitest";
import {
  toFlowJsonWireCase,
  fromFlowJsonWireCase,
  canonicalizeFlowJson,
  computeFlowJsonHash,
  __setHashImplementation
} from "../src/utils/flow-json";

describe("Flow JSON case mapping", () => {
  const sampleFlow = {
    version: "7.2",
    dataApiVersion: "3.0",
    routingModel: { BOOKING: [] as string[] },
    screens: [
      {
        id: "BOOKING",
        title: "Booking",
        terminal: true,
        data: {
          availableSlots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" }
              }
            },
            __example__: [
              { id: "1", title: "09:00" }
            ]
          }
        },
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "Dropdown",
              name: "slot",
              label: "Choose",
              dataSource: "${data.availableSlots}",
              onSelectAction: {
                name: "data_exchange",
                payload: { action: "updateDate", date: "${form.date}" }
              },
              initValue: "",
              errorMessage: "Required",
              someNewProp: "value"
            },
            {
              type: "Footer",
              label: "Continue",
              onClickAction: {
                name: "complete",
                payload: { slot: "${form.slot}" }
              }
            }
          ]
        }
      }
    ]
  } as const;

  it("maps camelCase authoring keys to Meta wire keys", () => {
    const result = toFlowJsonWireCase(sampleFlow);

    expect(result).toMatchObject({
      version: "7.2",
      data_api_version: "3.0",
      routing_model: { BOOKING: [] },
      screens: [
        {
          id: "BOOKING",
          layout: {
            children: [
              expect.objectContaining({
                type: "Dropdown",
                "data-source": "${data.availableSlots}",
                "on-select-action": {
                  name: "data_exchange",
                  payload: { action: "updateDate", date: "${form.date}" }
                },
                "init-value": "",
                "error-message": "Required"
              }),
              expect.objectContaining({
                type: "Footer",
                "on-click-action": {
                  name: "complete",
                  payload: { slot: "${form.slot}" }
                }
              })
            ]
          }
        }
      ]
    });

    const dropdown = (result as any).screens[0].layout.children[0];
    expect(dropdown).toHaveProperty("data-source", "${data.availableSlots}");
    expect(dropdown).not.toHaveProperty("dataSource");
    expect(dropdown).toHaveProperty("on-select-action");
    expect(dropdown).not.toHaveProperty("onSelectAction");
    expect(dropdown).toHaveProperty("some-new-prop", "value");

    // ensure developer-defined schema fields remain untouched
    const dataSchema = (result as any).screens[0].data;
    expect(dataSchema).toHaveProperty("availableSlots");
  });

  it("throws in strict mode when snake_case authoring keys are used", () => {
    const withSnake = {
      ...sampleFlow,
      data_api_version: "3.0"
    } as unknown as typeof sampleFlow;

    expect(() => toFlowJsonWireCase(withSnake)).toThrow(/dataApiVersion/);
  });

  it("round-trips from wire to camelCase", () => {
    const wire = toFlowJsonWireCase(sampleFlow);
    const roundTripped = fromFlowJsonWireCase(wire);
    expect(roundTripped).toStrictEqual(sampleFlow);
  });

  it("allows snake keys when strictCamel is disabled", () => {
    const withSnake = {
      ...sampleFlow,
      layout: {
        type: "SingleColumnLayout",
        children: [
          { "left-caption": "Hi" }
        ]
      }
    } as any;

    expect(() => toFlowJsonWireCase(withSnake, { strictCamel: false })).not.toThrow();
  });
});

describe("Flow JSON canonicalization & hashing", () => {
  afterEach(() => {
    __setHashImplementation(undefined);
  });

  it("produces stable canonical JSON irrespective of key order", () => {
    const a = { screens: [{ id: "A", title: "T" }], version: "7.2" };
    const b = { version: "7.2", screens: [{ title: "T", id: "A" }] };

    const canonicalA = canonicalizeFlowJson(a);
    const canonicalB = canonicalizeFlowJson(b);

    expect(canonicalA).toBe(canonicalB);
    expect(canonicalA?.trim().startsWith("{"));
  });

  it("hashes identical Flow JSON to the same digest", () => {
    const a = { version: "7.2", screens: [{ id: "A", title: "T" }] };
    const b = { screens: [{ title: "T", id: "A" }], version: "7.2" };

    const hashA = computeFlowJsonHash(a);
    const hashB = computeFlowJsonHash(b);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes when content changes", () => {
    const a = { version: "7.2", screens: [{ id: "A" }] };
    const b = { version: "7.2", screens: [{ id: "B" }] };

    expect(computeFlowJsonHash(a)).not.toBe(computeFlowJsonHash(b));
  });

  it("throws descriptive error when hashing implementation is missing", () => {
    __setHashImplementation(null as any);
    expect(() => computeFlowJsonHash({ version: "7.2" })).toThrow(/SHA-256 hashing is not available/);
  });
});
