import { describe, expect, it } from "vitest";

import { handlePhnValidation } from "./phn-validation";

import type { PhnValidationResult } from "@betty/shared";

function parse(input: string): PhnValidationResult {
  return JSON.parse(input) as PhnValidationResult;
}

describe("handlePhnValidation", () => {
  it("returns valid result for valid PHN", () => {
    const result = parse(handlePhnValidation({ phn: "111111118" }));
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe("111111118");
    expect(result.last4).toBe("1118");
  });

  it("returns invalid result for bad PHN", () => {
    const result = parse(handlePhnValidation({ phn: "111111111" }));
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns JSON string", () => {
    const raw = handlePhnValidation({ phn: "111111118" });
    expect(typeof raw).toBe("string");
    // Verify it's valid JSON
    const parsed = parse(raw);
    expect(parsed.valid).toBe(true);
  });
});
