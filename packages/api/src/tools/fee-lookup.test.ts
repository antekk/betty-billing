import { describe, expect, it, vi } from "vitest";

// Mock the fee-code service before importing the module under test
vi.mock("@/services/fee-code.service", () => ({
  searchFeeCodes: vi.fn(),
  getFeeCode: vi.fn(),
}));

import { handleFeeCodeLookup } from "./fee-lookup";

import { getFeeCode, searchFeeCodes } from "@/services/fee-code.service";

const mockGetFeeCode = vi.mocked(getFeeCode);
const mockSearchFeeCodes = vi.mocked(searchFeeCodes);

interface LookupResult {
  found: boolean;
  code?: string;
  description?: string;
  baseFee?: string;
  category?: string;
  rulesNotes?: string | null;
  message?: string;
  count?: number;
  results?: { code: string; description: string; baseFee: string; category: string }[];
  error?: string;
  details?: string;
}

function parse(input: string): LookupResult {
  return JSON.parse(input) as LookupResult;
}

describe("handleFeeCodeLookup", () => {
  it("returns fee code details for exact_code lookup", async () => {
    mockGetFeeCode.mockResolvedValue({
      code: "03.01AA",
      description: "Comprehensive visit",
      baseFee: "85.00",
      category: "visits",
      rulesNotes: "Minimum 25 minutes",
      effectiveDate: "2025-01-01",
      endDate: "2099-12-31",
    });

    const result = parse(await handleFeeCodeLookup({ query: "visit", exact_code: "03.01AA" }));
    expect(result.found).toBe(true);
    expect(result.code).toBe("03.01AA");
    expect(result.baseFee).toBe("85.00");
  });

  it("returns not found for unknown exact code", async () => {
    mockGetFeeCode.mockResolvedValue(null);

    const result = parse(await handleFeeCodeLookup({ query: "visit", exact_code: "99.99ZZ" }));
    expect(result.found).toBe(false);
    expect(result.message).toContain("99.99ZZ");
  });

  it("searches by query when no exact_code", async () => {
    mockSearchFeeCodes.mockResolvedValue([
      {
        code: "03.01AA",
        description: "Comprehensive visit",
        baseFee: "85.00",
        category: "visits",
        rulesNotes: null,
        effectiveDate: "2025-01-01",
        endDate: "2099-12-31",
      },
    ]);

    const result = parse(await handleFeeCodeLookup({ query: "comprehensive visit" }));
    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    expect(result.results?.[0].code).toBe("03.01AA");
  });

  it("returns not found for no search results", async () => {
    mockSearchFeeCodes.mockResolvedValue([]);

    const result = parse(await handleFeeCodeLookup({ query: "nonexistent procedure" }));
    expect(result.found).toBe(false);
    expect(result.message).toContain("nonexistent procedure");
  });

  it("handles errors gracefully", async () => {
    mockSearchFeeCodes.mockRejectedValue(new Error("DB connection failed"));

    const result = parse(await handleFeeCodeLookup({ query: "visit" }));
    expect(result.error).toBeDefined();
    expect(result.details).toContain("DB connection failed");
  });
});
