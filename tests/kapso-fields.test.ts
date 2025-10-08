import { describe, expect, it } from "vitest";
import { buildKapsoFields, buildKapsoMessageFields, KAPSO_MESSAGE_FIELDS } from "../src";

describe("Kapso field helpers", () => {
  it("builds a selector for default fields", () => {
    expect(buildKapsoFields()).toBe(`kapso(${KAPSO_MESSAGE_FIELDS.join(",")})`);
    // Ensure media_url is part of the default set
    expect(KAPSO_MESSAGE_FIELDS).toContain("media_url");
  });

  it("deduplicates and trims custom fields", () => {
    const selector = buildKapsoFields([" flow_response ", "flow_response", "order_text"]);
    expect(selector).toBe("kapso(flow_response,order_text)");
  });

  it("returns kapso() when no fields requested", () => {
    expect(buildKapsoFields([])).toBe("kapso()");
  });

  it("builds message fields via variadic helper", () => {
    const selector = buildKapsoMessageFields(["flow_response"], "order_text");
    expect(selector).toBe("kapso(flow_response,order_text)");
  });

  it("supports requesting only media_url", () => {
    const selector = buildKapsoMessageFields("media_url");
    expect(selector).toBe("kapso(media_url)");
  });

  it("falls back to defaults when variadic helper called without args", () => {
    expect(buildKapsoMessageFields()).toBe(`kapso(${KAPSO_MESSAGE_FIELDS.join(",")})`);
  });
});
