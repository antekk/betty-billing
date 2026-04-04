import { describe, expect, it } from "vitest";

import { handleDateResolution } from "./date-resolution";

interface DateResult {
  resolved: boolean;
  date?: string;
  formatted?: string;
  daysDiff?: number;
  warning?: string;
  error?: string;
}

function parse(input: string): DateResult {
  return JSON.parse(input) as DateResult;
}

describe("handleDateResolution", () => {
  const refDate = "2026-03-18";

  it("resolves 'yesterday' relative to reference date", () => {
    const result = parse(
      handleDateResolution({ expression: "yesterday", reference_date: refDate })
    );
    expect(result.resolved).toBe(true);
    expect(result.date).toBe("2026-03-17");
  });

  it("resolves 'today' relative to reference date", () => {
    const result = parse(handleDateResolution({ expression: "today", reference_date: refDate }));
    expect(result.resolved).toBe(true);
    expect(result.date).toBe("2026-03-18");
  });

  it("resolves explicit dates like 'March 16'", () => {
    const result = parse(handleDateResolution({ expression: "March 16", reference_date: refDate }));
    expect(result.resolved).toBe(true);
    expect(result.date).toBe("2026-03-16");
  });

  it("resolves day names like 'Monday'", () => {
    const result = parse(handleDateResolution({ expression: "Monday", reference_date: refDate }));
    expect(result.resolved).toBe(true);
    expect(result.date).toBeDefined();
  });

  it("returns formatted date string", () => {
    const result = parse(handleDateResolution({ expression: "today", reference_date: refDate }));
    expect(result.formatted).toBeDefined();
    expect(typeof result.formatted).toBe("string");
  });

  it("warns when date is more than 90 days in the past", () => {
    const result = parse(
      handleDateResolution({ expression: "December 1", reference_date: refDate })
    );
    expect(result.resolved).toBe(true);
    expect(result.warning).toContain("90 days");
  });

  it("warns when date is in the future", () => {
    const result = parse(handleDateResolution({ expression: "April 15", reference_date: refDate }));
    expect(result.resolved).toBe(true);
    expect(result.warning).toContain("future");
  });

  it("returns error for unparseable input", () => {
    const result = parse(
      handleDateResolution({ expression: "not a date at all xyz", reference_date: refDate })
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("uses current date when no reference_date provided", () => {
    const result = parse(handleDateResolution({ expression: "today" }));
    expect(result.resolved).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(today);
  });
});
