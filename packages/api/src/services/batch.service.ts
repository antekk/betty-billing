import { and, eq, inArray, lt } from "drizzle-orm";

import { createAHCIPAdapter, type AHCIPAdapter, type AHCIPClaimInput } from "@/adapters/ahcip";
import { db } from "@/db";
import { claims, batchSubmissions, timelineEntries, users } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { formatIsoDate } from "@/lib/dates";
import { decrypt } from "@/lib/encryption";

/** A batch normally completes in seconds; anything in `submitting` this long was interrupted. */
const STUCK_SUBMITTING_MS = 30 * 60 * 1000;

/**
 * Collect all staged claims and submit them in a batch to AHCIP.
 *
 * Concurrency safety: staged claims are claimed atomically (row locks +
 * status-guarded update to the `submitting` intermediate state) inside a
 * transaction, so a concurrent cancel or a second worker can never act on the
 * same rows. Terminal transitions are likewise guarded on `submitting`.
 */
export async function processBatchSubmission(
  adapter: AHCIPAdapter = createAHCIPAdapter()
): Promise<{
  total: number;
  accepted: number;
  rejected: number;
}> {
  const now = new Date();

  const claimedClaims = await db.transaction(async (tx) => {
    const staged = await tx
      .select()
      .from(claims)
      .where(eq(claims.status, "staged"))
      .for("update", { skipLocked: true });

    if (staged.length === 0) return [];

    return tx
      .update(claims)
      .set({ status: "submitting", submittedAt: now, updatedAt: now })
      .where(
        and(
          inArray(
            claims.id,
            staged.map((c) => c.id)
          ),
          eq(claims.status, "staged")
        )
      )
      .returning();
  });

  if (claimedClaims.length === 0) {
    console.log("No staged claims to submit");
    return { total: 0, accepted: 0, rejected: 0 };
  }

  console.log(`Processing batch of ${claimedClaims.length} claims`);

  // Get user practitioner IDs
  const userIds = [...new Set(claimedClaims.map((c) => c.userId))];
  const usersList = await db.select().from(users).where(inArray(users.id, userIds));
  const userMap = new Map(usersList.map((u) => [u.id, u]));

  // A claim without a practitioner ID must never reach AHCIP — hold it for the
  // physician instead of submitting a placeholder.
  const submittable: typeof claimedClaims = [];
  for (const claim of claimedClaims) {
    if (userMap.get(claim.userId)?.ahcipPractitionerId) {
      submittable.push(claim);
    } else {
      await holdClaim(
        claim,
        "Your AHCIP practitioner ID is missing — add it to your profile so this claim can be submitted."
      );
    }
  }

  if (submittable.length === 0) {
    console.log("No submittable claims (all held for missing practitioner ID)");
    return { total: 0, accepted: 0, rejected: 0 };
  }

  // Create batch submission record
  const [batch] = await db
    .insert(batchSubmissions)
    .values({
      status: "pending",
      claimIds: submittable.map((c) => c.id),
      submittedAt: now,
    })
    .returning();

  // Build AHCIP input
  const ahcipClaims: AHCIPClaimInput[] = submittable.map((claim) => ({
    id: claim.id,
    feeCode: claim.feeCode,
    modifier: claim.modifier,
    phn: decrypt(claim.phn),
    serviceDate: claim.serviceDate,
    diagnosticCode: claim.diagnosticCode,
    // holdClaim above guarantees this is present
    practitionerId: userMap.get(claim.userId)?.ahcipPractitionerId ?? "",
  }));

  // Submit to AHCIP
  let response;
  try {
    response = await adapter.submitBatch(ahcipClaims);
  } catch (error) {
    // AHCIP never confirmed receipt — release the claims for the next run and
    // record the failed batch, then rethrow so the job scheduler retries.
    await db
      .update(claims)
      .set({ status: "staged", submittedAt: null, updatedAt: new Date() })
      .where(
        and(
          inArray(
            claims.id,
            submittable.map((c) => c.id)
          ),
          eq(claims.status, "submitting")
        )
      );
    await db
      .update(batchSubmissions)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(batchSubmissions.id, batch.id));
    console.error(`Batch ${batch.id} failed before AHCIP confirmed receipt:`, error);
    throw error;
  }

  // Process results
  let accepted = 0;
  let rejected = 0;
  const resolvedIds = new Set<string>();

  for (const result of response.results) {
    const claim = submittable.find((c) => c.id === result.claimId);
    if (!claim) continue;
    resolvedIds.add(claim.id);

    if (result.accepted) {
      accepted++;
      await db
        .update(claims)
        .set({
          status: "accepted",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(claims.id, result.claimId), eq(claims.status, "submitting")));
      await syncClaimWidgetStatus(claim.timelineEntryId, "accepted");
    } else {
      rejected++;
      await db
        .update(claims)
        .set({
          status: "rejected",
          rejectionReason: result.rejectionReason ?? "Unknown reason",
          updatedAt: new Date(),
        })
        .where(and(eq(claims.id, result.claimId), eq(claims.status, "submitting")));
      await syncClaimWidgetStatus(claim.timelineEntryId, "rejected");

      // Create proactive timeline entry for rejected claims
      await createRejectionNotification(claim, result.rejectionReason ?? "Unknown reason");
    }

    await auditLog(claim.userId, "claim_submitted", "claim", claim.id, {
      batchId: batch.id,
      accepted: result.accepted,
      rejectionCode: result.rejectionCode,
    });
  }

  // Claims AHCIP returned no verdict for cannot be resubmitted blindly — hold
  // them for review.
  for (const claim of submittable) {
    if (!resolvedIds.has(claim.id)) {
      await holdClaim(claim, "AHCIP returned no result for this claim — it needs manual review.");
    }
  }

  // Update batch status: any rejection makes the batch a partial failure
  // (including the all-rejected case — "completed" would wrongly imply success).
  const batchStatus = rejected === 0 ? "completed" : "partial_failure";

  await db
    .update(batchSubmissions)
    .set({
      status: batchStatus,
      completedAt: new Date(),
      responseData: response,
    })
    .where(eq(batchSubmissions.id, batch.id));

  console.log(
    `Batch complete: ${accepted} accepted, ${rejected} rejected out of ${submittable.length}`
  );

  return { total: submittable.length, accepted, rejected };
}

/**
 * Recover claims stranded in `submitting` by a crash or kill between claiming
 * and result processing. They are NOT re-staged automatically — AHCIP may have
 * received them, and resubmitting would double-bill — so they go to
 * `needs_attention` for the physician to resolve. Run before each batch.
 */
export async function reconcileStuckClaims(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_SUBMITTING_MS);

  const stuck = await db
    .update(claims)
    .set({
      status: "needs_attention",
      rejectionReason:
        "Submission was interrupted before AHCIP confirmed the result — needs review.",
      updatedAt: now,
    })
    .where(and(eq(claims.status, "submitting"), lt(claims.updatedAt, cutoff)))
    .returning();

  for (const claim of stuck) {
    await syncClaimWidgetStatus(claim.timelineEntryId, "needs_attention");
    await createAttentionNotification(
      claim,
      "Submission was interrupted before AHCIP confirmed the result — needs review."
    );
    await auditLog(claim.userId, "claim_needs_attention", "claim", claim.id, {
      reason: "stuck_submitting",
    });
  }

  if (stuck.length > 0) {
    console.warn(`Reconciled ${stuck.length} claim(s) stuck in submitting`);
  }
  return stuck.length;
}

/** Move a claim out of the pipeline into `needs_attention` with a visible reason. */
async function holdClaim(claim: typeof claims.$inferSelect, reason: string): Promise<void> {
  await db
    .update(claims)
    .set({ status: "needs_attention", rejectionReason: reason, updatedAt: new Date() })
    .where(and(eq(claims.id, claim.id), eq(claims.status, "submitting")));
  await syncClaimWidgetStatus(claim.timelineEntryId, "needs_attention");
  await createAttentionNotification(claim, reason);
  await auditLog(claim.userId, "claim_needs_attention", "claim", claim.id, { reason });
}

/** Keep the original confirmation widget's status in sync with the claim. */
async function syncClaimWidgetStatus(
  timelineEntryId: string | null,
  status: string
): Promise<void> {
  if (!timelineEntryId) return;
  const entryRows = await db
    .select()
    .from(timelineEntries)
    .where(eq(timelineEntries.id, timelineEntryId))
    .limit(1);
  const entry = entryRows.at(0);
  if (entry?.widgetData) {
    const widgetData = { ...(entry.widgetData as Record<string, unknown>), status };
    await db
      .update(timelineEntries)
      .set({ widgetData })
      .where(eq(timelineEntries.id, timelineEntryId));
  }
}

async function createAttentionNotification(
  claim: typeof claims.$inferSelect,
  reason: string
): Promise<void> {
  await db.insert(timelineEntries).values({
    userId: claim.userId,
    type: "widget",
    direction: "outbound",
    content: `Your ${claim.serviceDate} claim (${claim.feeCode}) for PHN ...${claim.phnLast4} needs attention — ${reason}`,
    widgetType: "action_card",
    widgetData: {
      type: "action_card",
      title: "Claim Needs Attention",
      body: reason,
      claimId: claim.id,
      actions: [
        {
          label: "View Claim",
          action: "view_claim",
          payload: { claimId: claim.id },
        },
      ],
    },
    visibility: "default",
    importanceFlag: true,
  });
}

async function createRejectionNotification(
  claim: typeof claims.$inferSelect,
  rejectionReason: string
): Promise<void> {
  const serviceDateFormatted = formatIsoDate(claim.serviceDate, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  await db.insert(timelineEntries).values({
    userId: claim.userId,
    type: "widget",
    direction: "outbound",
    content: `I tried to submit your ${serviceDateFormatted} claim (${claim.feeCode}) for PHN ...${claim.phnLast4} but AHCIP flagged it — ${rejectionReason.toLowerCase()}. Want me to help fix it?`,
    widgetType: "action_card",
    widgetData: {
      type: "action_card",
      title: "Claim Needs Attention",
      body: rejectionReason,
      claimId: claim.id,
      actions: [
        {
          label: "View Claim",
          action: "view_claim",
          payload: { claimId: claim.id },
        },
        {
          label: "Fix It",
          action: "send_message",
          payload: {
            message: `Help me fix the rejected claim for ${claim.feeCode} on ${serviceDateFormatted}`,
          },
        },
      ],
    },
    visibility: "default",
    importanceFlag: true,
  });
}
