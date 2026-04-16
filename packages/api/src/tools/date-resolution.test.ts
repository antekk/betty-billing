import { describe, expect, test } from "bun:test";

import { handleDateResolution } from "./date-resolution";

function parse(input: Parameters<typeof handleDateResolution>[0]) {
  return JSON.parse(handleDateResolution(input));
}

describe("handleDateResolution", () => {
  const refDate = "2026-04-16";

  describe("relative dates", () => {
    test("resolves 'today'", () => {
      const result = parse({ expression: "today", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.date).toBe("2026-04-16");
    });

    test("resolves 'yesterday'", () => {
      const result = parse({ expression: "yesterday", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.date).toBe("2026-04-15");
    });

    test("resolves 'last Friday' relative to a Thursday reference", () => {
      // April 16, 2026 is a Thursday; last Friday = April 10
      const result = parse({ expression: "last Friday", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.date).toBe("2026-04-10");
    });
  });

  describe("absolute dates", () => {
    test("resolves 'March 16'", () => {
      const result = parse({ expression: "March 16", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.date).toContain("03-16");
    });

    test("resolves 'January 1, 2026'", () => {
      const result = parse({ expression: "January 1, 2026", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.date).toBe("2026-01-01");
    });
  });

  describe("unrecognized expressions", () => {
    test("returns resolved: false for gibberish", () => {
      const result = parse({ expression: "xyzzy blorp", reference_date: refDate });
      expect(result.resolved).toBe(false);
      expect(result.error).toContain("Could not understand");
    });
  });

  describe("warnings", () => {
    test("warns when date is more than 90 days in the past", () => {
      const result = parse({ expression: "January 1, 2026", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.warning).toContain("90 days");
    });

    test("warns when date is in the future", () => {
      const result = parse({ expression: "December 25, 2026", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.warning).toContain("future");
    });

    test("no warning for a recent past date", () => {
      const result = parse({ expression: "yesterday", reference_date: refDate });
      expect(result.resolved).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe("formatted output", () => {
    test("includes a human-readable formatted date", () => {
      const result = parse({ expression: "today", reference_date: refDate });
      expect(result.formatted).toBeDefined();
      expect(typeof result.formatted).toBe("string");
      expect(result.formatted.length).toBeGreaterThan(0);
    });
  });
});
