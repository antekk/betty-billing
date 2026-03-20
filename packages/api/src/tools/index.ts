import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { feeCodeLookupTool, handleFeeCodeLookup } from "./fee-lookup";
import { phnValidationTool, handlePhnValidation } from "./phn-validation";
import { dateResolutionTool, handleDateResolution } from "./date-resolution";
import { createClaimTool, handleCreateClaim } from "./create-claim";

export const tools: Tool[] = [
  feeCodeLookupTool,
  phnValidationTool,
  dateResolutionTool,
  createClaimTool,
];

export type ToolName =
  | "fee_code_lookup"
  | "validate_phn"
  | "resolve_date"
  | "create_claim";

/**
 * Execute a tool by name and return the result as a string.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  switch (name as ToolName) {
    case "fee_code_lookup":
      return handleFeeCodeLookup(input as Parameters<typeof handleFeeCodeLookup>[0]);
    case "validate_phn":
      return handlePhnValidation(input as Parameters<typeof handlePhnValidation>[0]);
    case "resolve_date":
      return handleDateResolution(input as Parameters<typeof handleDateResolution>[0]);
    case "create_claim":
      return handleCreateClaim(
        input as Parameters<typeof handleCreateClaim>[0],
        userId
      );
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
