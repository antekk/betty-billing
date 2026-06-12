import type { Tool } from "@anthropic-ai/sdk/resources/messages";

import { cancelClaimForUser } from "@/services/claim.service";

export const cancelClaimTool: Tool = {
  name: "cancel_claim",
  description:
    "Cancel a claim that hasn't been submitted to AHCIP yet (pending_confirmation, staged, rejected, or needs_attention). Use this when the physician asks to cancel, discard, or drop a claim. Submitted or accepted claims cannot be cancelled through this flow.",
  input_schema: {
    type: "object" as const,
    properties: {
      claim_id: {
        type: "string",
        description: "The UUID of the claim to cancel",
      },
    },
    required: ["claim_id"],
  },
};

export async function handleCancelClaim(
  input: { claim_id: string },
  userId: string
): Promise<string> {
  const result = await cancelClaimForUser(input.claim_id, userId);

  if (!result.cancelled) {
    return JSON.stringify({ cancelled: false, error: result.error });
  }

  return JSON.stringify({
    cancelled: true,
    claimId: result.claim.id,
    feeCode: result.claim.feeCode,
    serviceDate: result.claim.serviceDate,
    phnLast4: result.claim.phnLast4,
  });
}
