import { createClaimTool, handleCreateClaim } from "./create-claim";
import { dateResolutionTool, handleDateResolution } from "./date-resolution";
import { diagCodeLookupTool, handleDiagCodeLookup } from "./diag-code-lookup";
import { feeCodeLookupTool, handleFeeCodeLookup } from "./fee-lookup";
import { getClaimTool, handleGetClaim } from "./get-claim";
import { listClaimsTool, handleListClaims } from "./list-claims";
import { phnValidationTool, handlePhnValidation } from "./phn-validation";
import { updateClaimTool, handleUpdateClaim } from "./update-claim";

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const tools: Tool[] = [
  feeCodeLookupTool,
  diagCodeLookupTool,
  phnValidationTool,
  dateResolutionTool,
  createClaimTool,
  updateClaimTool,
  getClaimTool,
  listClaimsTool,
];

export type ToolName =
  | "fee_code_lookup"
  | "diag_code_lookup"
  | "validate_phn"
  | "resolve_date"
  | "create_claim"
  | "update_claim"
  | "get_claim"
  | "list_claims";

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
    case "diag_code_lookup":
      return handleDiagCodeLookup(input as Parameters<typeof handleDiagCodeLookup>[0]);
    case "validate_phn":
      return handlePhnValidation(input as Parameters<typeof handlePhnValidation>[0]);
    case "resolve_date":
      return handleDateResolution(input as Parameters<typeof handleDateResolution>[0]);
    case "create_claim":
      return handleCreateClaim(input as Parameters<typeof handleCreateClaim>[0], userId);
    case "update_claim":
      return handleUpdateClaim(input as Parameters<typeof handleUpdateClaim>[0], userId);
    case "get_claim":
      return handleGetClaim(input as Parameters<typeof handleGetClaim>[0], userId);
    case "list_claims":
      return handleListClaims(input as Parameters<typeof handleListClaims>[0], userId);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
