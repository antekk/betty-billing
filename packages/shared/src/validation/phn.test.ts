import { describe, expect, test } from "bun:test";

import { validatePhn } from "./phn";

describe("validatePhn", () => {
  describe("valid PHNs", () => {
    test("accepts a valid 9-digit PHN that passes Luhn check", () => {
      // 123456782 passes Luhn: doubled-from-right gives sum divisible by 10
      const result = validatePhn("123456782");
      expect(result.valid).toBe(true);
      expect(result.formatted).toBe("123456782");
      expect(result.last4).toBe("6782");
      expect(result.error).toBeUndefined();
    });

    test("strips whitespace before validating", () => {
      const result = validatePhn("  123456782  ");
      expect(result.valid).toBe(true);
      expect(result.formatted).toBe("123456782");
    });

    test("strips dashes before validating", () => {
      const result = validatePhn("123-456-782");
      expect(result.valid).toBe(true);
      expect(result.formatted).toBe("123456782");
    });

    test("strips mixed whitespace and dashes", () => {
      const result = validatePhn("123 - 456 - 782");
      expect(result.valid).toBe(true);
      expect(result.formatted).toBe("123456782");
    });

    test("accepts PHN 000000000 (all zeros pass Luhn)", () => {
      const result = validatePhn("000000000");
      expect(result.valid).toBe(true);
    });
  });

  describe("non-digit input", () => {
    test("rejects letters", () => {
      const result = validatePhn("12345678A");
      expect(result.valid).toBe(false);
      expect(result.formatted).toBeNull();
      expect(result.last4).toBeNull();
      expect(result.error).toBe("PHN must contain only digits");
    });

    test("rejects special characters other than dashes/spaces", () => {
      const result = validatePhn("12345.782");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("PHN must contain only digits");
    });

    test("rejects empty string", () => {
      const result = validatePhn("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("PHN must contain only digits");
    });
  });

  describe("wrong length", () => {
    test("rejects too short (8 digits)", () => {
      const result = validatePhn("12345678");
      expect(result.valid).toBe(false);
      expect(result.formatted).toBeNull();
      expect(result.last4).toBeNull();
      expect(result.error).toBe("PHN must be 9 digits (got 8)");
    });

    test("rejects too long (10 digits)", () => {
      const result = validatePhn("1234567890");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("PHN must be 9 digits (got 10)");
    });
  });

  describe("Luhn check digit", () => {
    test("rejects valid-length PHN with bad check digit", () => {
      // 123456789 does NOT pass Luhn
      const result = validatePhn("123456789");
      expect(result.valid).toBe(false);
      expect(result.last4).toBe("6789"); // still extracts last4
      expect(result.error).toBe("PHN check digit is invalid");
    });

    test("rejects 111111111 (fails Luhn)", () => {
      const result = validatePhn("111111111");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("PHN check digit is invalid");
    });
  });
});
