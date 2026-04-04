import { describe, expect, it } from "vitest";

import { validateFeeCodeFormat } from "./fee-code";

describe("validateFeeCodeFormat", () => {
  describe("numeric fee codes", () => {
    it("accepts standard format like 03.01AA", () => {
      const result = validateFeeCodeFormat("03.01AA");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });

    it("accepts single letter suffix like 08.19A", () => {
      const result = validateFeeCodeFormat("08.19A");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("08.19A");
    });

    it("accepts no-suffix format like 13.99", () => {
      const result = validateFeeCodeFormat("13.99");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("13.99");
    });

    it("normalizes lowercase to uppercase", () => {
      const result = validateFeeCodeFormat("03.01aa");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });

    it("trims whitespace", () => {
      const result = validateFeeCodeFormat("  03.01AA  ");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("03.01AA");
    });
  });

  describe("alpha fee codes (lab/path)", () => {
    it("accepts E1 format", () => {
      const result = validateFeeCodeFormat("E1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });

    it("accepts E 1 with space", () => {
      const result = validateFeeCodeFormat("E 1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });

    it("accepts multi-digit alpha codes like E13", () => {
      const result = validateFeeCodeFormat("E13");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E13");
    });

    it("normalizes lowercase alpha codes", () => {
      const result = validateFeeCodeFormat("e1");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("E1");
    });
  });

  describe("invalid codes", () => {
    it("rejects random text", () => {
      const result = validateFeeCodeFormat("hello");
      expect(result.valid).toBe(false);
      expect(result.normalized).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("rejects empty string", () => {
      const result = validateFeeCodeFormat("");
      expect(result.valid).toBe(false);
    });

    it("rejects numeric-only without dot", () => {
      const result = validateFeeCodeFormat("0301AA");
      expect(result.valid).toBe(false);
    });

    it("rejects three-letter suffix", () => {
      const result = validateFeeCodeFormat("03.01ABC");
      expect(result.valid).toBe(false);
    });

    it("includes the input in the error message", () => {
      const result = validateFeeCodeFormat("xyz123");
      expect(result.error).toContain("xyz123");
    });
  });
});
