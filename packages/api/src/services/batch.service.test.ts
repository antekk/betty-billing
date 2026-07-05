import { describe, expect, test, beforeEach } from "bun:test";

import { processBatchSubmission, reconcileStuckClaims } from "./batch.service";

import type { AHCIPAdapter, AHCIPBatchResponse, AHCIPClaimInput } from "@/adapters/ahcip";

import { claims, users, batchSubmissions, timelineEntries, auditLogs } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { dbState, setSelect } from "@/test-support/fakes";

// A fixed, valid hex key so real encrypt()/decrypt() round-trip within a test.
const ENCRYPTION_KEY = "a".repeat(64);

function makeAdapter(response: AHCIPBatchResponse) {
  const calls: AHCIPClaimInput[][] = [];
  const adapter: AHCIPAdapter = {
    submitBatch: async (input) => {
      calls.push(input);
      return response;
    },
  };
  return { adapter, calls };
}

function makeStagedClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "claim-1",
    userId: "user-1",
    status: "staged",
    feeCode: "03.03A",
    modifier: null,
    phn: encrypt("123456782"),
    phnLast4: "6782",
    serviceDate: "2026-06-20",
    diagnosticCode: "780",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
});

describe("processBatchSubmission", () => {
  test("empty staged set: returns zeros and never calls the adapter", async () => {
    setSelect(claims, []);
    const { adapter, calls } = makeAdapter({ batchId: "b", results: [], submittedAt: "t" });

    const result = await processBatchSubmission(adapter);

    expect(result).toEqual({ total: 0, accepted: 0, rejected: 0 });
    expect(calls).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  test("mixed batch: 1 accepted, 1 rejected -> correct totals and side effects", async () => {
    const accepted = makeStagedClaim({ id: "claim-acc" });
    const rejected = makeStagedClaim({ id: "claim-rej", phnLast4: "1111" });
    setSelect(claims, [accepted, rejected]);
    setSelect(users, [{ id: "user-1", ahcipPractitionerId: "PRAC-123" }]);

    const { adapter, calls } = makeAdapter({
      batchId: "ahcip-batch-1",
      submittedAt: "2026-06-27T00:00:00.000Z",
      results: [
        { claimId: "claim-acc", accepted: true },
        {
          claimId: "claim-rej",
          accepted: false,
          rejectionCode: "E42",
          rejectionReason: "Invalid diagnostic code",
        },
      ],
    });

    const result = await processBatchSubmission(adapter);

    expect(result).toEqual({ total: 2, accepted: 1, rejected: 1 });

    // Adapter called once with both claims; PHNs decrypted, practitioner resolved.
    expect(calls).toHaveLength(1);
    const sent = calls[0];
    expect(sent).toHaveLength(2);
    expect(sent.map((c) => c.id).sort()).toEqual(["claim-acc", "claim-rej"]);
    expect(sent[0].phn).toBe("123456782");
    expect(sent[0].practitionerId).toBe("PRAC-123");

    // Batch record inserted with the staged claim ids.
    const batchInsert = dbState.inserts.find((i) => i.table === batchSubmissions);
    expect(batchInsert?.values.status).toBe("pending");
    expect(batchInsert?.values.claimIds).toEqual(["claim-acc", "claim-rej"]);

    // A rejection action-card timeline entry for the rejected claim only.
    const timelineInserts = dbState.inserts.filter((i) => i.table === timelineEntries);
    expect(timelineInserts).toHaveLength(1);
    const tl = timelineInserts[0].values;
    expect(tl.widgetType).toBe("action_card");
    expect(tl.userId).toBe("user-1");
    expect((tl.widgetData as { claimId: string }).claimId).toBe("claim-rej");
    expect(tl.importanceFlag).toBe(true);
    expect(tl.content as string).toContain("invalid diagnostic code");
    expect((tl.widgetData as { body: string }).body).toBe("Invalid diagnostic code");

    // Claim status transitions: bulk claimed as submitting, then accepted / rejected.
    const claimUpdates = dbState.updates.filter((u) => u.table === claims);
    expect(claimUpdates.find((u) => u.set.status === "submitting")).toBeDefined();
    expect(claimUpdates.find((u) => u.set.status === "accepted")).toBeDefined();
    const rejectedUpdate = claimUpdates.find((u) => u.set.status === "rejected");
    expect(rejectedUpdate?.set.rejectionReason).toBe("Invalid diagnostic code");

    // Some-rejected -> partial_failure.
    const batchUpdate = dbState.updates.find((u) => u.table === batchSubmissions);
    expect(batchUpdate?.set.status).toBe("partial_failure");

    // One audit entry per result.
    const audits = dbState.inserts.filter((i) => i.table === auditLogs);
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.values.action === "claim_submitted")).toBe(true);
  });

  test("all-rejected batch is finalized as partial_failure, not completed", async () => {
    setSelect(claims, [makeStagedClaim({ id: "c1" }), makeStagedClaim({ id: "c2" })]);
    setSelect(users, [{ id: "user-1", ahcipPractitionerId: "PRAC-123" }]);

    const { adapter } = makeAdapter({
      batchId: "b",
      submittedAt: "t",
      results: [
        { claimId: "c1", accepted: false, rejectionReason: "No record of this PHN." },
        { claimId: "c2", accepted: false, rejectionReason: "No record of this PHN." },
      ],
    });

    const result = await processBatchSubmission(adapter);

    expect(result).toEqual({ total: 2, accepted: 0, rejected: 2 });
    const batchUpdate = dbState.updates.find((u) => u.table === batchSubmissions);
    expect(batchUpdate?.set.status).toBe("partial_failure");
  });

  test("adapter failure: claims released back to staged, batch marked failed, error rethrown", async () => {
    setSelect(claims, [makeStagedClaim({ id: "c1" })]);
    setSelect(users, [{ id: "user-1", ahcipPractitionerId: "PRAC-123" }]);

    const adapter: AHCIPAdapter = {
      submitBatch: () => Promise.reject(new Error("AHCIP unreachable")),
    };

    let thrown: unknown;
    try {
      await processBatchSubmission(adapter);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("AHCIP unreachable");

    const claimUpdates = dbState.updates.filter((u) => u.table === claims);
    // Claimed as submitting, then released back to staged (never "submitted").
    expect(claimUpdates.find((u) => u.set.status === "submitting")).toBeDefined();
    const release = claimUpdates.find((u) => u.set.status === "staged");
    expect(release).toBeDefined();
    expect(release?.set.submittedAt).toBeNull();
    expect(claimUpdates.find((u) => u.set.status === "accepted")).toBeUndefined();

    const batchUpdate = dbState.updates.find((u) => u.table === batchSubmissions);
    expect(batchUpdate?.set.status).toBe("failed");
  });

  test("claim whose user has no practitioner ID is held, never sent to AHCIP", async () => {
    setSelect(claims, [makeStagedClaim({ id: "c1" })]);
    setSelect(users, [{ id: "user-1", ahcipPractitionerId: null }]);

    const { adapter, calls } = makeAdapter({ batchId: "b", submittedAt: "t", results: [] });

    const result = await processBatchSubmission(adapter);

    expect(result).toEqual({ total: 0, accepted: 0, rejected: 0 });
    expect(calls).toHaveLength(0);

    const claimUpdates = dbState.updates.filter((u) => u.table === claims);
    const held = claimUpdates.find((u) => u.set.status === "needs_attention");
    expect(held).toBeDefined();
    expect(held?.set.rejectionReason as string).toContain("practitioner ID");

    // The physician gets a visible notification card.
    const tl = dbState.inserts.find((i) => i.table === timelineEntries);
    expect(tl?.values.widgetType).toBe("action_card");
    expect(tl?.values.importanceFlag).toBe(true);

    // No batch row is created for an empty submittable set.
    expect(dbState.inserts.find((i) => i.table === batchSubmissions)).toBeUndefined();
  });
});

describe("reconcileStuckClaims", () => {
  test("stuck submitting claims go to needs_attention with a notification and audit entry", async () => {
    const stuck = makeStagedClaim({ id: "stuck-1", status: "submitting" });
    setSelect(claims, [stuck]);

    const count = await reconcileStuckClaims();

    expect(count).toBe(1);
    const update = dbState.updates.find((u) => u.table === claims);
    expect(update?.set.status).toBe("needs_attention");
    expect(update?.set.rejectionReason as string).toContain("interrupted");

    const tl = dbState.inserts.find((i) => i.table === timelineEntries);
    expect(tl?.values.widgetType).toBe("action_card");

    const audit = dbState.inserts.find((i) => i.table === auditLogs);
    expect(audit?.values.action).toBe("claim_needs_attention");
  });

  test("no stuck claims: no writes", async () => {
    setSelect(claims, []);

    const count = await reconcileStuckClaims();

    expect(count).toBe(0);
    expect(dbState.updates.filter((u) => u.table === claims)).toHaveLength(1);
    expect(dbState.inserts).toHaveLength(0);
  });
});
