import { eq, and } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { claims, timelineEntries } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { authenticate, isAuthError } from "@/middleware/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Find the claim
  const claimRows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, id), eq(claims.userId, auth.userId)))
    .limit(1);

  const claim = claimRows.at(0);
  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (claim.status !== "pending_confirmation") {
    return NextResponse.json(
      { error: `Claim cannot be confirmed — current status is "${claim.status}"` },
      { status: 400 }
    );
  }

  // Transition to staged. Status-guarded so a concurrent confirm/cancel can't
  // be double-applied — zero matched rows means we lost the race.
  const updated = await db
    .update(claims)
    .set({
      status: "staged",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(claims.id, id),
        eq(claims.userId, auth.userId),
        eq(claims.status, "pending_confirmation")
      )
    )
    .returning({ id: claims.id });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Claim was already processed — refresh to see its current status" },
      { status: 409 }
    );
  }

  // Update the widget data to reflect confirmed status
  if (claim.timelineEntryId) {
    const entryRows = await db
      .select()
      .from(timelineEntries)
      .where(eq(timelineEntries.id, claim.timelineEntryId))
      .limit(1);

    const entry = entryRows.at(0);
    if (entry?.widgetData) {
      const widgetData = entry.widgetData as Record<string, unknown>;
      widgetData.status = "staged";
      await db
        .update(timelineEntries)
        .set({ widgetData })
        .where(eq(timelineEntries.id, claim.timelineEntryId));
    }
  }

  // Add a system event to the timeline
  await db.insert(timelineEntries).values({
    userId: auth.userId,
    type: "system_event",
    direction: "system",
    content: `Claim confirmed — ${claim.feeCode} for PHN ...${claim.phnLast4} on ${claim.serviceDate}. Queued for submission.`,
    visibility: "filtered",
    importanceFlag: false,
  });

  // Betty acknowledges the confirmation (PRD Flow 3: "Done — submitted.")
  await db.insert(timelineEntries).values({
    userId: auth.userId,
    type: "message",
    direction: "outbound",
    content: "Done — submitted. Anything else?",
    visibility: "default",
    importanceFlag: false,
  });

  await auditLog(auth.userId, "claim_confirmed", "claim", id, {
    feeCode: claim.feeCode,
    phnLast4: claim.phnLast4,
  });

  return NextResponse.json({ success: true, status: "staged" });
}
