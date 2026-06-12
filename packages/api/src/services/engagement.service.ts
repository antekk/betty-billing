import { eq, max } from "drizzle-orm";

import { getReminderThresholdDays, isReminderDue } from "./engagement.rules";

import { db } from "@/db";
import { claims, timelineEntries, users } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { sendPushToUser } from "@/lib/push";

/**
 * Find physicians who haven't billed in an unusual amount of time and reach
 * out once per gap. Run daily by the worker.
 */
export async function sendBillingReminders(now = new Date()): Promise<{ reminded: number }> {
  const thresholdDays = getReminderThresholdDays();

  // Latest claim per user — users who never billed are never nudged
  const lastClaims = await db
    .select({ userId: claims.userId, lastClaimAt: max(claims.createdAt) })
    .from(claims)
    .groupBy(claims.userId);

  let reminded = 0;

  for (const row of lastClaims) {
    if (!row.lastClaimAt) continue;

    const userRows = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    const user = userRows.at(0);
    if (!user) continue;

    if (!isReminderDue(row.lastClaimAt, user.lastBillingReminderAt, now, thresholdDays)) continue;

    const daysSince = Math.floor(
      (now.getTime() - row.lastClaimAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    await db.insert(timelineEntries).values({
      userId: user.id,
      type: "message",
      direction: "outbound",
      content: `It's been about ${daysSince} days since your last claim — just checking in. If you've had shifts recently, send them my way and I'll get them billed.`,
      visibility: "default",
      importanceFlag: true,
    });

    await db
      .update(users)
      .set({ lastBillingReminderAt: now, updatedAt: now })
      .where(eq(users.id, user.id));

    await sendPushToUser(user.id, {
      title: "Betty",
      body: "It's been a little while since your last claim — anything to bill?",
    });

    await auditLog(user.id, "billing_reminder_sent", "user", user.id, {
      daysSinceLastClaim: daysSince,
      thresholdDays,
    });

    reminded++;
  }

  if (reminded > 0) console.log(`Billing reminders sent: ${reminded}`);
  return { reminded };
}
