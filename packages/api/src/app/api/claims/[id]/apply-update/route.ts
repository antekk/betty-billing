import { eq, and } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import type { ClaimUpdateConfirmationData } from "@betty/shared";

import { db } from "@/db";
import { claims, timelineEntries } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { authenticate, isAuthError } from "@/middleware/auth";

// Statuses where applying an amendment is allowed — mirrors update_claim tool
const EDITABLE_STATUSES = new Set([
  "pending_confirmation",
  "staged",
  "rejected",
  "needs_attention",
]);

/**
 * Apply a proposed claim update (created by the update_claim tool).
 * The proposal is read from its timeline entry — the client only points at it,
 * it never supplies the new values directly.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  let body: { timelineEntryId?: string };
  try {
    body = (await request.json()) as { timelineEntryId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.timelineEntryId) {
    return NextResponse.json({ error: "timelineEntryId is required" }, { status: 400 });
  }

  const claimRows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, id), eq(claims.userId, auth.userId)))
    .limit(1);
  const claim = claimRows.at(0);
  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (!EDITABLE_STATUSES.has(claim.status)) {
    return NextResponse.json(
      { error: `Claim cannot be updated — current status is "${claim.status}"` },
      { status: 400 }
    );
  }

  // Load the proposal widget and verify it belongs to this user and claim
  const entryRows = await db
    .select()
    .from(timelineEntries)
    .where(
      and(eq(timelineEntries.id, body.timelineEntryId), eq(timelineEntries.userId, auth.userId))
    )
    .limit(1);
  const entry = entryRows.at(0);
  if (entry?.widgetType !== "claim_update_confirmation") {
    return NextResponse.json({ error: "Update proposal not found" }, { status: 404 });
  }

  const proposal = entry.widgetData as ClaimUpdateConfirmationData;
  if (proposal.claimId !== claim.id) {
    return NextResponse.json({ error: "Proposal does not match this claim" }, { status: 400 });
  }
  if (proposal.applied) {
    return NextResponse.json({ error: "This update has already been applied" }, { status: 409 });
  }

  // A fixed rejected/needs_attention claim goes back into the submission queue
  const wasRejected = claim.status === "rejected" || claim.status === "needs_attention";
  const newStatus = wasRejected ? "staged" : claim.status;
  const now = new Date();

  // Status-guarded on the status we validated: if the claim moved (e.g. the
  // batch job just picked it up), zero rows match and nothing is overwritten.
  const updated = await db
    .update(claims)
    .set({
      feeCode: proposal.current.feeCode,
      modifier: proposal.current.modifier,
      diagnosticCode: proposal.current.diagnosticCode,
      serviceDate: proposal.current.serviceDate,
      patientName: proposal.current.patientName,
      expectedFee: proposal.current.expectedFee,
      status: newStatus,
      rejectionReason: wasRejected ? null : claim.rejectionReason,
      resolvedAt: wasRejected ? now : claim.resolvedAt,
      updatedAt: now,
    })
    .where(
      and(eq(claims.id, claim.id), eq(claims.userId, auth.userId), eq(claims.status, claim.status))
    )
    .returning({ id: claims.id });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Claim changed while applying the update — please try again" },
      { status: 409 }
    );
  }

  // Mark the proposal widget as applied
  const appliedProposal: ClaimUpdateConfirmationData = {
    ...proposal,
    applied: true,
    status: newStatus,
  };
  await db
    .update(timelineEntries)
    .set({ widgetData: appliedProposal })
    .where(eq(timelineEntries.id, entry.id));

  // Keep the original confirmation widget in sync so the timeline reads true
  if (claim.timelineEntryId) {
    const originalRows = await db
      .select()
      .from(timelineEntries)
      .where(eq(timelineEntries.id, claim.timelineEntryId))
      .limit(1);
    const original = originalRows.at(0);
    if (original?.widgetType === "claim_confirmation" && original.widgetData) {
      const widgetData = {
        ...(original.widgetData as Record<string, unknown>),
        feeCode: proposal.current.feeCode,
        feeCodeDescription: proposal.current.feeCodeDescription,
        modifier: proposal.current.modifier,
        serviceDate: proposal.current.serviceDate,
        serviceDateFormatted: proposal.current.serviceDateFormatted,
        patientName: proposal.current.patientName,
        expectedFee: proposal.current.expectedFee,
        status: newStatus,
      };
      await db
        .update(timelineEntries)
        .set({ widgetData })
        .where(eq(timelineEntries.id, claim.timelineEntryId));
    }
  }

  const changeSummary = proposal.changes
    .map((c) => `${c.label}: ${c.before ?? "—"} → ${c.after ?? "—"}`)
    .join("; ");
  await db.insert(timelineEntries).values({
    userId: auth.userId,
    type: "system_event",
    direction: "system",
    content: wasRejected
      ? `Claim updated and re-queued for submission — ${changeSummary}.`
      : `Claim updated — ${changeSummary}.`,
    visibility: "filtered",
    importanceFlag: false,
  });

  await auditLog(auth.userId, "claim_update_applied", "claim", claim.id, {
    timelineEntryId: entry.id,
    changes: proposal.changes.map((c) => ({ field: c.field, before: c.before, after: c.after })),
    newStatus,
  });

  return NextResponse.json({ success: true, status: newStatus });
}
