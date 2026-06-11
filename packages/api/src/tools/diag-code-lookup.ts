import type { Tool } from "@anthropic-ai/sdk/resources/messages";

import {
  searchDiagnosticCodes,
  getDiagnosticCode,
  type DiagnosticCodeSystem,
} from "@/services/diag-code.service";

export const diagCodeLookupTool: Tool = {
  name: "diag_code_lookup",
  description:
    "Look up diagnostic codes (ICD-9 or ICD-10) by keyword or exact code. AHCIP claims must be submitted with ICD-9 codes — when the physician is creating or updating a claim, default to system='icd9'. Use ICD-10 only when the physician explicitly asks about ICD-10 or describes a code in that format. Always use this tool rather than guessing diagnostic codes.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Search query — either a specific diagnostic code (e.g., '250.00', 'E11.9') or a description keyword (e.g., 'type 2 diabetes', 'hypertension')",
      },
      exact_code: {
        type: "string",
        description:
          "If you know the exact code, provide it here for a precise lookup. Takes priority over query.",
      },
      system: {
        type: "string",
        enum: ["icd9", "icd10"],
        description:
          "Filter to a specific code system. Default to 'icd9' for claim work since AHCIP requires ICD-9. Omit to search both.",
      },
    },
    required: ["query"],
  },
};

export async function handleDiagCodeLookup(input: {
  query: string;
  exact_code?: string;
  system?: DiagnosticCodeSystem;
}): Promise<string> {
  try {
    if (input.exact_code) {
      const result = await getDiagnosticCode(input.exact_code, input.system);
      if (!result) {
        return JSON.stringify({
          found: false,
          message: `Diagnostic code "${input.exact_code}" not found${input.system ? ` in ${input.system.toUpperCase()}` : ""}.`,
        });
      }
      return JSON.stringify({
        found: true,
        code: result.code,
        codeSystem: result.codeSystem,
        description: result.description,
        category: result.category,
        enabled: result.enabled,
      });
    }

    const results = await searchDiagnosticCodes(input.query, {
      system: input.system,
      enabledOnly: true,
      limit: 10,
    });

    if (results.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No diagnostic codes found matching "${input.query}"${input.system ? ` in ${input.system.toUpperCase()}` : ""}.`,
      });
    }

    return JSON.stringify({
      found: true,
      count: results.length,
      results: results.map((r) => ({
        code: r.code,
        codeSystem: r.codeSystem,
        description: r.description,
        category: r.category,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      error: "Failed to look up diagnostic code",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
