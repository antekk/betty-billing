/**
 * Pure decision logic for proactive billing-gap reminders (PRD Flow 5).
 * Kept free of db/env imports so it's trivially testable.
 */

const DEFAULT_REMINDER_DAYS = 7;

export function getReminderThresholdDays(): number {
  const parsed = parseInt(process.env.BILLING_REMINDER_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMINDER_DAYS;
}

/**
 * Reminds when the last claim is older than the threshold, and at most once
 * per silence period: after one nudge Betty stays quiet until the physician
 * bills again ("respects silence").
 */
export function isReminderDue(
  lastClaimAt: Date,
  lastReminderAt: Date | null,
  now: Date,
  thresholdDays: number
): boolean {
  const gapMs = now.getTime() - lastClaimAt.getTime();
  if (gapMs < thresholdDays * 24 * 60 * 60 * 1000) return false;
  // Already nudged for this gap?
  if (lastReminderAt && lastReminderAt > lastClaimAt) return false;
  return true;
}
