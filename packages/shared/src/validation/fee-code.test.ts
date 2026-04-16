import { describe, expect, test } from "bun:test";

import { validateFeeCodeFormat } from "./fee-code";

describe("validateFeeCodeFormat", () => {
  describe("numeric fee codes (XX.XXAA pattern)", () => {
    test("accepts standard code with two-letter suffix: 03.01AA", () => {
      const result = validateFeeCodeFormat("03.01AA");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });

    test("accepts code with one-letter suffix: 08.19A", () => {
      const result = validateFeeCodeFormat("08.19A");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("08.19A");
    });

    test("accepts code with no letter suffix: 13.99", () => {
      const result = validateFeeCodeFormat("13.99");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("13.99");
    });

    test("normalizes lowercase to uppercase", () => {
      const result = validateFeeCodeFormat("03.01aa");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });

    test("trims surrounding whitespace", () => {
      const result = validateFeeCodeFormat("  03.01AA  ");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });
  });

  describe("alpha fee codes (lab/path codes)", () => {
    test("accepts E1", () => {
      const result = validateFeeCodeFormat("E1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });

    test("accepts E 1 with space and normalizes", () => {
      const result = validateFeeCodeFormat("E 1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });

    test("accepts multi-digit alpha codes: E13", () => {
      const result = validateFeeCodeFormat("E13");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E13");
    });

    test("accepts up to 4 digits: A1234", () => {
      const result = validateFeeCodeFormat("A1234");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("A1234");
    });

    test("normalizes lowercase alpha codes", () => {
      const result = validateFeeCodeFormat("e1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });
  });

  describe("invalid formats", () => {
    test("rejects bare number", () => {
      const result = validateFeeCodeFormat("12345");
      expect(result.valid).toBe(false);
      expect(result.normalized).toBeNull();
      expect(result.error).toContain("doesn't look like an Alberta fee code");
    });

    test("rejects random text", () => {
      const result = validateFeeCodeFormat("hello");
      expect(result.valid).toBe(false);
      expect(result.normalized).toBeNull();
    });

    test("rejects code with three letter suffix", () => {
      const result = validateFeeCodeFormat("03.01ABC");
      expect(result.valid).toBe(false);
    });

    test("rejects code missing section number", () => {
      const result = validateFeeCodeFormat(".01AA");
      expect(result.valid).toBe(false);
    });

    test("rejects empty string", () => {
      const result = validateFeeCodeFormat("");
      expect(result.valid).toBe(false);
    });

    test("rejects alpha code with 5 digits", () => {
      const result = validateFeeCodeFormat("E12345");
      expect(result.valid).toBe(false);
    });
  });
});
