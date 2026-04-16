import { describe, expect, test } from "bun:test";

import { handlePhnValidation } from "./phn-validation";

function parse(phn: string) {
  return JSON.parse(handlePhnValidation({ phn }));
}

describe("handlePhnValidation", () => {
  test("returns JSON with valid: true for a valid PHN", () => {
    const result = parse("123456782");
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe("123456782");
    expect(result.last4).toBe("6782");
  });

  test("returns JSON with valid: false and error for an invalid PHN", () => {
    const result = parse("123456789");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("returns JSON with valid: false for non-digit input", () => {
    const result = parse("ABCDEFGHI");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("PHN must contain only digits");
  });
});
