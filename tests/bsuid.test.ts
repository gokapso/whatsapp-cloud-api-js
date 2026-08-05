import { describe, expect, it } from "vitest";
import { BSUID_PATTERN, isBusinessScopedUserId } from "../src";

describe("isBusinessScopedUserId", () => {
  it("accepts plain and parent BSUIDs", () => {
    expect(isBusinessScopedUserId("US.13491208655302741918")).toBe(true);
    expect(isBusinessScopedUserId("US.ENT.11815799212886844830")).toBe(true);
    expect(isBusinessScopedUserId("MX.a1B2c3")).toBe(true);
  });

  it("rejects phone numbers and malformed values", () => {
    expect(isBusinessScopedUserId("15551234567")).toBe(false);
    expect(isBusinessScopedUserId("+1 555 123 4567")).toBe(false);
    expect(isBusinessScopedUserId("USA.134912")).toBe(false);
    expect(isBusinessScopedUserId("mx.a1B2c3")).toBe(false);
    expect(isBusinessScopedUserId("US.")).toBe(false);
    expect(isBusinessScopedUserId("US.134 912")).toBe(false);
  });

  it("exports the pattern itself", () => {
    expect(BSUID_PATTERN.test("US.13491208655302741918")).toBe(true);
  });
});
