import type { Tool } from "@anthropic-ai/sdk/resources/messages";

import { getClaimForUser } from "@/services/claim.service";
import { getFeeCode } from "@/services/fee-code.service";

export const getClaimTool: Tool = {
  name: "get_claim",
  description:
    "Fetch the current state of a single claim by its ID. Use this when the physician asks about a specific claim, before proposing changes via update_claim, or when you need to remind them what's on a claim. The claim's encrypted PHN is never exposed — only the last 4 digits.",
  input_schema: {
    type: "object" as const,
    properties: {
      claim_id: {
        type: "string",
        description: "The UUID of the claim to fetch",
      },
    },
    required: ["claim_id"],
  },
};

export async function handleGetClaim(
  input: { claim_id: string },
  userId: string
): Promise<string> {
  try {
    const claim = await getClaimForUser(input.claim_id, userId);
    if (!claim) {
      return JSON.stringify({
        found: false,
        message: `Claim "${input.claim_id}" not found.`,
      });
    }

    const feeCode = await getFeeCode(claim.feeCode);

    return JSON.stringify({
      found: true,
      claim: {
        id: claim.id,
        status: claim.status,
        feeCode: claim.feeCode,
        feeCodeDescription: feeCode?.description ?? null,
        modifier: claim.modifier,
        diagnosticCode: claim.diagnosticCode,
        phnLast4: claim.phnLast4,
        patientName: claim.patientName,
        serviceDate: claim.serviceDate,
        expectedFee: claim.expectedFee,
        rejectionReason: claim.rejectionReason,
        submittedAt: claim.submittedAt,
        resolvedAt: claim.resolvedAt,
      },
    });
  } catch (error) {
    return JSON.stringify({
      error: "Failed to fetch claim",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
