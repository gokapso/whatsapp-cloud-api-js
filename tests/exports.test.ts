import { describe, it, expect } from "vitest";
import * as root from "../src";

describe("Root exports", () => {
  it("does not export server-only helpers", () => {
    expect("verifySignature" in root).toBe(false);
  });
});

