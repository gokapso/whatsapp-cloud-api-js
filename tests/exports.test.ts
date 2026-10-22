import { describe, it, expect, expectTypeOf } from "vitest";
import * as root from "../src";
import {
  buildTemplateDefinition,
  TemplateDefinition,
  type FlowInteractiveInput,
  type TemplateDefinitionInput
} from "../src";
import type { MessagesResource } from "../src";

describe("Root exports", () => {
  it("does not export server-only helpers", () => {
    expect("verifySignature" in root).toBe(false);
  });

  it("exposes buildTemplatePayload", () => {
    expect(typeof (root as any).buildTemplatePayload).toBe("function");
  });

  it("exposes buildTemplateDefinition as a named import", () => {
    expect(buildTemplateDefinition).toBe(TemplateDefinition.buildTemplateDefinition);
    expectTypeOf<TemplateDefinitionInput>().toEqualTypeOf<TemplateDefinition.TemplateDefinitionInput>();
  });

  it("exposes FlowInteractiveInput as the sendInteractiveFlow input type", () => {
    expectTypeOf<FlowInteractiveInput>().toEqualTypeOf<Parameters<MessagesResource["sendInteractiveFlow"]>[0]>();
  });
});
