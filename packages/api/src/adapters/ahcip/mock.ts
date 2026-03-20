import type {
  AHCIPAdapter,
  AHCIPClaimInput,
  AHCIPBatchResponse,
  AHCIPClaimResult,
} from "./interface";
import { randomUUID } from "crypto";

const REJECTION_REASONS = [
  {
    code: "DOCRQ",
    reason: "A diagnostic code is required for this service.",
  },
  {
    code: "01",
    reason: "We have no record of this person registered with this PHN.",
  },
  {
    code: "05",
    reason: "This PHN is not effective for the date(s) of service submitted.",
  },
  {
    code: "CHGRQ",
    reason: "A change is required — the modifier submitted is not valid for this service code.",
  },
  {
    code: "RFUSE",
    reason: "Duplicate claim — a claim for this service has already been submitted.",
  },
];

/**
 * Mock AHCIP adapter that simulates batch submission.
 * Accepts ~80% of claims, rejects ~20% with realistic reasons.
 */
export class MockAHCIPAdapter implements AHCIPAdapter {
  async submitBatch(claims: AHCIPClaimInput[]): Promise<AHCIPBatchResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const results: AHCIPClaimResult[] = claims.map((claim) => {
      // 80% acceptance rate
      const accepted = Math.random() > 0.2;

      if (accepted) {
        return { claimId: claim.id, accepted: true };
      }

      // Pick a random rejection reason
      // But if no diagnostic code, always reject for that
      if (!claim.diagnosticCode) {
        return {
          claimId: claim.id,
          accepted: false,
          rejectionCode: "DOCRQ",
          rejectionReason: "A diagnostic code is required for this service.",
        };
      }

      const rejection = REJECTION_REASONS[Math.floor(Math.random() * REJECTION_REASONS.length)];
      return {
        claimId: claim.id,
        accepted: false,
        rejectionCode: rejection.code,
        rejectionReason: rejection.reason,
      };
    });

    return {
      batchId: randomUUID(),
      results,
      submittedAt: new Date().toISOString(),
    };
  }
}
