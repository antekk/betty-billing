import { beforeEach, describe, expect, it, vi } from "vitest";

import { MockAHCIPAdapter } from "./mock";

import type { AHCIPClaimInput } from "./interface";

// Speed up tests by removing the 2s simulated network delay
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("MockAHCIPAdapter", () => {
  const adapter = new MockAHCIPAdapter();

  const makeClaim = (overrides?: Partial<AHCIPClaimInput>): AHCIPClaimInput => ({
    id: "claim-1",
    feeCode: "03.01AA",
    modifier: null,
    phn: "111111118",
    serviceDate: "2026-03-18",
    diagnosticCode: null,
    practitionerId: "PRAC001",
    ...overrides,
  });

  it("returns results for all submitted claims", async () => {
    const claims = [makeClaim({ id: "c1" }), makeClaim({ id: "c2" }), makeClaim({ id: "c3" })];

    const response = await adapter.submitBatch(claims);
    expect(response.results).toHaveLength(3);
    expect(response.batchId).toBeDefined();
    expect(response.submittedAt).toBeDefined();
  });

  it("each result has claimId and accepted status", async () => {
    const response = await adapter.submitBatch([makeClaim()]);
    const result = response.results[0];

    expect(result.claimId).toBe("claim-1");
    expect(typeof result.accepted).toBe("boolean");
  });

  it("always rejects claims without diagnostic code as DOCRQ", async () => {
    // Submit a batch with many claims to statistically get some rejections
    const claims = Array.from({ length: 30 }, (_, i) =>
      makeClaim({ id: `c-${i}`, diagnosticCode: null })
    );

    const response = await adapter.submitBatch(claims);
    const rejected = response.results.filter((r) => !r.accepted);

    // With 30 claims at 80% acceptance, we should get some rejections
    expect(rejected.length).toBeGreaterThan(0);

    for (const result of rejected) {
      expect(result.rejectionCode).toBe("DOCRQ");
      expect(result.rejectionReason).toContain("diagnostic code");
    }
  });

  it("returns results for empty batch", async () => {
    const response = await adapter.submitBatch([]);
    expect(response.results).toHaveLength(0);
  });
});
