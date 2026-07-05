#!/usr/bin/env bun
/**
 * Schedule recurring jobs. The worker calls setupSchedules() on boot, so this
 * only needs to be run standalone to (re)configure schedules without a worker:
 *   bun run packages/api/src/jobs/scheduler.ts
 */

import { getQueue } from "./queue";

export async function setupSchedules(): Promise<void> {
  const queue = getQueue();

  // Batch submission every hour. Retries are safe: on an AHCIP error the
  // batch releases its claims back to `staged` before rethrowing.
  await queue.upsertJobScheduler(
    "batch-submit-hourly",
    { every: 60 * 60 * 1000 }, // every hour
    {
      name: "batch-submit",
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    }
  );

  console.log("Job schedules configured:");
  console.log("  - batch-submit: every hour");
}

if (import.meta.main) {
  setupSchedules()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Failed to set up schedules:", err);
      process.exit(1);
    });
}
