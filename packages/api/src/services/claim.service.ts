import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import type { ClaimStatus } from "@betty/shared";

import { db } from "@/db";
import { claims, timelineEntries } from "@/db/schema";
import { auditLog } from "@/lib/audit";

export interface ClaimSummary {
  id: string;
  status: ClaimStatus;
  feeCode: string;
  modifier: string | null;
  diagnosticCode: string | null;
  phnLast4: string;
  patientName: string | null;
  serviceDate: string;
  expectedFee: string;
  rejectionReason: string | null;
  submittedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Fetch a single claim owned by the user. Never returns the encrypted PHN — only last4.
 */
export async function getClaimForUser(
  claimId: string,
  userId: string
): Promise<ClaimSummary | null> {
  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      feeCode: claims.feeCode,
      modifier: claims.modifier,
      diagnosticCode: claims.diagnosticCode,
      phnLast4: claims.phnLast4,
      patientName: claims.patientName,
      serviceDate: claims.serviceDate,
      expectedFee: claims.expectedFee,
      rejectionReason: claims.rejectionReason,
      submittedAt: claims.submittedAt,
      resolvedAt: claims.resolvedAt,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
      userId: claims.userId,
    })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.userId, userId)))
    .limit(1);

  const row = rows.at(0);
  if (!row) return null;
  // Strip userId from the returned shape
  const { userId: _userId, ...rest } = row;
  void _userId;
  return rest;
}

// The limit can come from the LLM — clamp junk (negative, NaN) to sane bounds.
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

interface ListClaimsOptions {
  status?: ClaimStatus;
  serviceDateFrom?: string; // ISO YYYY-MM-DD
  serviceDateTo?: string;
  phnLast4?: string;
  limit?: number;
}

export async function listClaimsForUser(
  userId: string,
  opts: ListClaimsOptions = {}
): Promise<ClaimSummary[]> {
  const filters = [eq(claims.userId, userId)];
  if (opts.status) filters.push(eq(claims.status, opts.status));
  if (opts.serviceDateFrom) filters.push(gte(claims.serviceDate, opts.serviceDateFrom));
  if (opts.serviceDateTo) filters.push(lte(claims.serviceDate, opts.serviceDateTo));
  if (opts.phnLast4) filters.push(eq(claims.phnLast4, opts.phnLast4));

  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      feeCode: claims.feeCode,
      modifier: claims.modifier,
      diagnosticCode: claims.diagnosticCode,
      phnLast4: claims.phnLast4,
      patientName: claims.patientName,
      serviceDate: claims.serviceDate,
      expectedFee: claims.expectedFee,
      rejectionReason: claims.rejectionReason,
      submittedAt: claims.submittedAt,
      resolvedAt: claims.resolvedAt,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
    })
    .from(claims)
    .where(and(...filters))
    .orderBy(desc(claims.serviceDate))
    .limit(clampLimit(opts.limit));

  return rows;
}

// A claim can be cancelled any time before it reaches AHCIP
const CANCELLABLE_STATUSES = new Set<ClaimStatus>([
  "pending_confirmation",
  "staged",
  "rejected",
  "needs_attention",
]);

export type CancelClaimResult =
  | { cancelled: true; claim: ClaimSummary }
  | { cancelled: false; error: string };

/**
 * Cancel a claim that hasn't been submitted to AHCIP yet. Updates the original
 * confirmation widget and logs a timeline system event + audit entry.
 */
export async function cancelClaimForUser(
  claimId: string,
  userId: string
): Promise<CancelClaimResult> {
  const claim = await getClaimForUser(claimId, userId);
  if (!claim) {
    return { cancelled: false, error: "Claim not found" };
  }

  if (!CANCELLABLE_STATUSES.has(claim.status)) {
    return {
      cancelled: false,
      error: `Claim cannot be cancelled — current status is "${claim.status}"`,
    };
  }

  // Status-guarded write: if the claim changed state since the read above
  // (e.g. the batch job picked it up), zero rows match and we must not cancel.
  const now = new Date();
  const updatedRows = await db
    .update(claims)
    .set({ status: "cancelled", resolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(claims.id, claimId),
        eq(claims.userId, userId),
        inArray(claims.status, [...CANCELLABLE_STATUSES])
      )
    )
    .returning({ timelineEntryId: claims.timelineEntryId });

  if (updatedRows.length === 0) {
    const current = await getClaimForUser(claimId, userId);
    return {
      cancelled: false,
      error: current
        ? `Claim cannot be cancelled — current status is "${current.status}"`
        : "Claim not found",
    };
  }

  // Reflect the cancellation on the original confirmation widget
  const timelineEntryId = updatedRows.at(0)?.timelineEntryId;
  if (timelineEntryId) {
    const entryRows = await db
      .select()
      .from(timelineEntries)
      .where(eq(timelineEntries.id, timelineEntryId))
      .limit(1);
    const entry = entryRows.at(0);
    if (entry?.widgetData) {
      const widgetData = { ...(entry.widgetData as Record<string, unknown>), status: "cancelled" };
      await db
        .update(timelineEntries)
        .set({ widgetData })
        .where(eq(timelineEntries.id, timelineEntryId));
    }
  }

  await db.insert(timelineEntries).values({
    userId,
    type: "system_event",
    direction: "system",
    content: `Claim cancelled — ${claim.feeCode} for PHN ...${claim.phnLast4} on ${claim.serviceDate}.`,
    visibility: "filtered",
    importanceFlag: false,
  });

  await auditLog(userId, "claim_cancelled", "claim", claimId, {
    feeCode: claim.feeCode,
    phnLast4: claim.phnLast4,
    previousStatus: claim.status,
  });

  return { cancelled: true, claim: { ...claim, status: "cancelled", resolvedAt: now } };
}
