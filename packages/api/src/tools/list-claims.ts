import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { ClaimStatus } from "@betty/shared";

import { listClaimsForUser } from "@/services/claim.service";

const STATUSES: ClaimStatus[] = [
  "pending_confirmation",
  "staged",
  "submitted",
  "accepted",
  "rejected",
  "needs_attention",
];

export const listClaimsTool: Tool = {
  name: "list_claims",
  description:
    "List the physician's claims, optionally filtered by status, service date range, or patient PHN last-4. Use this for questions like 'what's outstanding?', 'what did I bill on Friday?', or 'any rejected claims?'. Returns up to 25 claims by default, ordered by service date (newest first).",
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: STATUSES,
        description: "Filter to a specific claim status",
      },
      service_date_from: {
        type: "string",
        description: "Inclusive lower bound on service_date (ISO YYYY-MM-DD)",
      },
      service_date_to: {
        type: "string",
        description: "Inclusive upper bound on service_date (ISO YYYY-MM-DD)",
      },
      phn_last4: {
        type: "string",
        description: "Filter to claims for a specific patient by their PHN last 4 digits",
      },
      limit: {
        type: "number",
        description: "Max claims to return (default 25, max 100)",
      },
    },
  },
};

export async function handleListClaims(
  input: {
    status?: ClaimStatus;
    service_date_from?: string;
    service_date_to?: string;
    phn_last4?: string;
    limit?: number;
  },
  userId: string
): Promise<string> {
  try {
    const results = await listClaimsForUser(userId, {
      status: input.status,
      serviceDateFrom: input.service_date_from,
      serviceDateTo: input.service_date_to,
      phnLast4: input.phn_last4,
      limit: input.limit,
    });

    return JSON.stringify({
      count: results.length,
      claims: results.map((c) => ({
        id: c.id,
        status: c.status,
        feeCode: c.feeCode,
        modifier: c.modifier,
        diagnosticCode: c.diagnosticCode,
        phnLast4: c.phnLast4,
        patientName: c.patientName,
        serviceDate: c.serviceDate,
        expectedFee: c.expectedFee,
        rejectionReason: c.rejectionReason,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      error: "Failed to list claims",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
