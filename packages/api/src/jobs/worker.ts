#!/usr/bin/env bun
/**
 * BullMQ worker process. Run as a separate process:
 *   bun run packages/api/src/jobs/worker.ts
 */

import { closeQueue, createWorker } from "./queue";
import { setupSchedules } from "./scheduler";

import type { Job } from "bullmq";

import { processBatchSubmission, reconcileStuckClaims } from "@/services/batch.service";

async function processJob(job: Job): Promise<void> {
  console.log(`Processing job: ${job.name} (${job.id})`);

  switch (job.name) {
    case "batch-submit": {
      await reconcileStuckClaims();
      const result = await processBatchSubmission();
      console.log(`Batch result:`, result);
      break;
    }

    default:
      console.warn(`Unknown job type: ${job.name}`);
  }
}

// Ensure recurring job schedules exist — makes the worker self-sufficient in
// deployment (no separate scheduler invocation needed)
await setupSchedules();

const worker = createWorker(processJob);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

// Without an error listener, a transient Redis error becomes an unhandled
// exception that kills the process (per BullMQ docs).
worker.on("error", (err) => {
  console.error("Worker error:", err);
});

// Finish the in-flight job before exiting so deploys don't kill a batch
// mid-submission.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  await worker.close();
  await closeQueue();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log("Betty worker started. Waiting for jobs...");
