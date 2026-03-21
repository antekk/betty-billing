import type { Tool } from "@anthropic-ai/sdk/resources/messages";

import { searchFeeCodes, getFeeCode } from "@/services/fee-code.service";

export const feeCodeLookupTool: Tool = {
  name: "fee_code_lookup",
  description:
    "Look up Alberta AHCIP fee codes. Use this to find fee codes by description/keyword or to get details for a specific code. Always use this tool rather than relying on memory for fee codes, fees, and billing rules.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Search query — either a specific fee code (e.g., '03.01AA') or a description keyword (e.g., 'comprehensive visit', 'colonoscopy')",
      },
      exact_code: {
        type: "string",
        description:
          "If you know the exact fee code, provide it here for a precise lookup. Takes priority over query.",
      },
    },
    required: ["query"],
  },
};

export async function handleFeeCodeLookup(input: {
  query: string;
  exact_code?: string;
}): Promise<string> {
  try {
    // Exact code lookup
    if (input.exact_code) {
      const result = await getFeeCode(input.exact_code);
      if (!result) {
        return JSON.stringify({
          found: false,
          message: `Fee code "${input.exact_code}" not found in the current schedule.`,
        });
      }
      return JSON.stringify({
        found: true,
        code: result.code,
        description: result.description,
        baseFee: result.baseFee,
        category: result.category,
        rulesNotes: result.rulesNotes,
      });
    }

    // Search by query
    const results = await searchFeeCodes(input.query, 10);

    if (results.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No fee codes found matching "${input.query}".`,
      });
    }

    return JSON.stringify({
      found: true,
      count: results.length,
      results: results.map((r) => ({
        code: r.code,
        description: r.description,
        baseFee: r.baseFee,
        category: r.category,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      error: "Failed to look up fee code",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
