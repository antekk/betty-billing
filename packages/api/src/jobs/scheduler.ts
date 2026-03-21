#!/usr/bin/env bun
/**
 * Schedule recurring jobs. Run once to set up schedules:
 *   bun run packages/api/src/jobs/scheduler.ts
 */

import { getQueue } from "./queue";

async function setupSchedules() {
  const queue = getQueue();

  // Batch submission every hour
  await queue.upsertJobScheduler(
    "batch-submit-hourly",
    { every: 60 * 60 * 1000 }, // every hour
    { name: "batch-submit" }
  );

  console.log("Job schedules configured:");
  console.log("  - batch-submit: every hour");
}

setupSchedules()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("Failed to set up schedules:", err);
    process.exit(1);
  });
