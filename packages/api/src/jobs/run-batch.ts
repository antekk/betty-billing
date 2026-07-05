#!/usr/bin/env bun
/**
 * One-shot batch submission for run-to-completion platforms (Cloud Run Jobs
 * triggered hourly by Cloud Scheduler). The long-lived BullMQ worker
 * (worker.ts) does the same thing on a self-managed schedule and needs Redis;
 * this needs only the database.
 */

import { processBatchSubmission, reconcileStuckClaims } from "@/services/batch.service";

try {
  const reconciled = await reconcileStuckClaims();
  const result = await processBatchSubmission();
  console.log(
    `Batch run complete: ${result.accepted} accepted, ${result.rejected} rejected, ` +
      `${result.total} total, ${reconciled} stuck claim(s) reconciled`
  );
  process.exit(0);
} catch (error) {
  console.error("Batch run failed:", error);
  process.exit(1);
}
