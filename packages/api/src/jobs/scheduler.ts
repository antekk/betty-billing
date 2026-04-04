#!/usr/bin/env bun
/**
 * Schedule recurring jobs. Run once to set up schedules:
 *   bun run packages/api/src/jobs/scheduler.ts
 */

import { getQueue } from "./queue";

import { createLogger } from "@/lib/logger";

const log = createLogger({ module: "scheduler" });

async function setupSchedules() {
  const queue = getQueue();

  // Batch submission every hour
  await queue.upsertJobScheduler(
    "batch-submit-hourly",
    { every: 60 * 60 * 1000 }, // every hour
    { name: "batch-submit" }
  );

  log.info({ schedule: "batch-submit-hourly", interval: "1h" }, "Job schedules configured");
}

setupSchedules()
  .then(() => {
    log.info("Scheduler setup complete");
    process.exit(0);
  })
  .catch((err: unknown) => {
    log.error({ err }, "Failed to set up schedules");
    process.exit(1);
  });
