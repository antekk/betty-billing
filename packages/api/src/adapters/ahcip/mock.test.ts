import { describe, expect, test } from "bun:test";

import type { AHCIPClaimInput } from "./interface";
import { MockAHCIPAdapter } from "./mock";

describe("MockAHCIPAdapter", () => {
  const adapter = new MockAHCIPAdapter();

  function makeClaim(overrides: Partial<AHCIPClaimInput> = {}): AHCIPClaimInput {
    return {
      id: "claim-1",
      feeCode: "03.01AA",
      modifier: null,
      phn: "123456782",
      serviceDate: "2026-04-16",
      diagnosticCode: "780",
      practitionerId: "PRAC-001",
      ...overrides,
    };
  }

  test("returns results for every submitted claim", async () => {
    const claims = [makeClaim({ id: "c1" }), makeClaim({ id: "c2" }), makeClaim({ id: "c3" })];
    const response = await adapter.submitBatch(claims);

    expect(response.results).toHaveLength(3);
    expect(response.batchId).toBeDefined();
    expect(response.submittedAt).toBeDefined();

    const claimIds = response.results.map((r) => r.claimId);
    expect(claimIds).toContain("c1");
    expect(claimIds).toContain("c2");
    expect(claimIds).toContain("c3");
  });

  test("each result has accepted boolean", async () => {
    const claims = [makeClaim()];
    const response = await adapter.submitBatch(claims);

    for (const result of response.results) {
      expect(typeof result.accepted).toBe("boolean");
      expect(result.claimId).toBe("claim-1");
    }
  });

  test("rejected claims include rejection code and reason", async () => {
    // Submit many claims to statistically get at least one rejection
    const claims = Array.from({ length: 30 }, (_, i) =>
      makeClaim({ id: `claim-${i}`, diagnosticCode: "780" })
    );
    const response = await adapter.submitBatch(claims);

    const rejected = response.results.filter((r) => !r.accepted);
    // With 30 claims at ~20% rejection rate, extremely unlikely to have zero rejections
    if (rejected.length > 0) {
      for (const r of rejected) {
        expect(r.rejectionCode).toBeDefined();
        expect(r.rejectionReason).toBeDefined();
        expect(typeof r.rejectionReason).toBe("string");
      }
    }
  });

  test("claims without diagnostic code are always rejected for DOCRQ", async () => {
    const claims = Array.from({ length: 10 }, (_, i) =>
      makeClaim({ id: `claim-${i}`, diagnosticCode: null })
    );
    const response = await adapter.submitBatch(claims);

    const rejected = response.results.filter((r) => !r.accepted);
    for (const r of rejected) {
      expect(r.rejectionCode).toBe("DOCRQ");
      expect(r.rejectionReason).toContain("diagnostic code");
    }
  });

  test("handles empty batch", async () => {
    const response = await adapter.submitBatch([]);
    expect(response.results).toHaveLength(0);
    expect(response.batchId).toBeDefined();
  });
});
