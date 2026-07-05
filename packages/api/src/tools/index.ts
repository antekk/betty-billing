import { z } from "zod";

import { cancelClaimTool, handleCancelClaim } from "./cancel-claim";
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
  cancelClaimTool,
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
  | "cancel_claim"
  | "get_claim"
  | "list_claims";

// Model-supplied inputs are untrusted: a wrong-typed field must produce a
// tool error the model can correct, not a thrown exception that kills the
// whole streaming turn (or garbage written to a claim).
const toolInputSchemas: Partial<Record<ToolName, z.ZodType<Record<string, unknown>>>> = {
  create_claim: z.object({
    fee_code: z.string(),
    phn: z.string(),
    patient_name: z.string().optional(),
    service_date: z.string(),
    modifier: z.string().optional(),
    diagnostic_code: z.string().optional(),
  }),
  update_claim: z.object({
    claim_id: z.string(),
    fee_code: z.string().optional(),
    modifier: z.string().optional(),
    diagnostic_code: z.string().optional(),
    service_date: z.string().optional(),
    patient_name: z.string().optional(),
    reason: z.string().optional(),
  }),
  cancel_claim: z.object({ claim_id: z.string() }),
  get_claim: z.object({ claim_id: z.string() }),
  validate_phn: z.object({ phn: z.string() }),
  resolve_date: z.object({
    expression: z.string(),
    reference_date: z.string().optional(),
  }),
};

/**
 * Execute a tool by name and return the result as a string.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  const schema = toolInputSchemas[name as ToolName];
  if (schema) {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return JSON.stringify({
        error: `Invalid input for ${name}: ${issue.path.join(".")} — ${issue.message}`,
      });
    }
    input = parsed.data;
  }

  try {
    switch (name as ToolName) {
      case "fee_code_lookup":
        return await handleFeeCodeLookup(input as Parameters<typeof handleFeeCodeLookup>[0]);
      case "diag_code_lookup":
        return await handleDiagCodeLookup(input as Parameters<typeof handleDiagCodeLookup>[0]);
      case "validate_phn":
        return handlePhnValidation(input as Parameters<typeof handlePhnValidation>[0]);
      case "resolve_date":
        return handleDateResolution(input as Parameters<typeof handleDateResolution>[0]);
      case "create_claim":
        return await handleCreateClaim(input as Parameters<typeof handleCreateClaim>[0], userId);
      case "update_claim":
        return await handleUpdateClaim(input as Parameters<typeof handleUpdateClaim>[0], userId);
      case "cancel_claim":
        return await handleCancelClaim(input as Parameters<typeof handleCancelClaim>[0], userId);
      case "get_claim":
        return await handleGetClaim(input as Parameters<typeof handleGetClaim>[0], userId);
      case "list_claims":
        return await handleListClaims(input, userId);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    // Log the real error; give the model a generic, non-leaking one.
    console.error(`Tool ${name} failed:`, error);
    return JSON.stringify({
      error: `The ${name} tool failed unexpectedly. Try a different approach or tell the physician something went wrong.`,
    });
  }
}
