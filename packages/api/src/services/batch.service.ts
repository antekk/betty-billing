import { db } from "@/db";
import { claims, batchSubmissions, timelineEntries, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createAHCIPAdapter, type AHCIPClaimInput } from "@/adapters/ahcip";
import { decrypt } from "@/lib/encryption";
import { auditLog } from "@/lib/audit";

/**
 * Collect all staged claims and submit them in a batch to AHCIP.
 */
export async function processBatchSubmission(): Promise<{
  total: number;
  accepted: number;
  rejected: number;
}> {
  // Find all staged claims
  const stagedClaims = await db.select().from(claims).where(eq(claims.status, "staged"));

  if (stagedClaims.length === 0) {
    console.log("No staged claims to submit");
    return { total: 0, accepted: 0, rejected: 0 };
  }

  console.log(`Processing batch of ${stagedClaims.length} claims`);

  // Get user practitioner IDs
  const userIds = [...new Set(stagedClaims.map((c) => c.userId))];
  const usersList = await db.select().from(users).where(inArray(users.id, userIds));

  const userMap = new Map(usersList.map((u) => [u.id, u]));

  // Create batch submission record
  const [batch] = await db
    .insert(batchSubmissions)
    .values({
      status: "pending",
      claimIds: stagedClaims.map((c) => c.id),
      submittedAt: new Date(),
    })
    .returning();

  // Build AHCIP input
  const ahcipClaims: AHCIPClaimInput[] = stagedClaims.map((claim) => ({
    id: claim.id,
    feeCode: claim.feeCode,
    modifier: claim.modifier,
    phn: decrypt(claim.phn),
    serviceDate: claim.serviceDate,
    diagnosticCode: claim.diagnosticCode,
    practitionerId: userMap.get(claim.userId)?.ahcipPractitionerId || "UNKNOWN",
  }));

  // Update claims to submitted status
  await db
    .update(claims)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(
      inArray(
        claims.id,
        stagedClaims.map((c) => c.id)
      )
    );

  // Submit to AHCIP
  const adapter = createAHCIPAdapter();
  const response = await adapter.submitBatch(ahcipClaims);

  // Process results
  let accepted = 0;
  let rejected = 0;

  for (const result of response.results) {
    const claim = stagedClaims.find((c) => c.id === result.claimId);
    if (!claim) continue;

    if (result.accepted) {
      accepted++;
      await db
        .update(claims)
        .set({
          status: "accepted",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(claims.id, result.claimId));
    } else {
      rejected++;
      await db
        .update(claims)
        .set({
          status: "rejected",
          rejectionReason: result.rejectionReason || "Unknown reason",
          updatedAt: new Date(),
        })
        .where(eq(claims.id, result.claimId));

      // Create proactive timeline entry for rejected claims
      await createRejectionNotification(claim, result.rejectionReason || "Unknown reason");
    }

    await auditLog(claim.userId, "claim_submitted", "claim", claim.id, {
      batchId: batch.id,
      accepted: result.accepted,
      rejectionCode: result.rejectionCode,
    });
  }

  // Update batch status
  const batchStatus =
    rejected === 0 ? "completed" : accepted === 0 ? "completed" : "partial_failure";

  await db
    .update(batchSubmissions)
    .set({
      status: batchStatus,
      completedAt: new Date(),
      responseData: response as unknown as Record<string, unknown>,
    })
    .where(eq(batchSubmissions.id, batch.id));

  console.log(
    `Batch complete: ${accepted} accepted, ${rejected} rejected out of ${stagedClaims.length}`
  );

  return { total: stagedClaims.length, accepted, rejected };
}

async function createRejectionNotification(
  claim: typeof claims.$inferSelect,
  rejectionReason: string
): Promise<void> {
  const serviceDateFormatted = new Date(claim.serviceDate).toLocaleDateString("en-CA", {
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
