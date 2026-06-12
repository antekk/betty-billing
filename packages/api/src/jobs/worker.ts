#!/usr/bin/env bun
/**
 * BullMQ worker process. Run as a separate process:
 *   bun run packages/api/src/jobs/worker.ts
 */

import { createWorker } from "./queue";
import { setupSchedules } from "./scheduler";

import type { Job } from "bullmq";

import { processBatchSubmission } from "@/services/batch.service";
import { sendBillingReminders } from "@/services/engagement.service";

async function processJob(job: Job): Promise<void> {
  console.log(`Processing job: ${job.name} (${job.id})`);

  switch (job.name) {
    case "batch-submit": {
      const result = await processBatchSubmission();
      console.log(`Batch result:`, result);
      break;
    }

    case "billing-reminder": {
      const result = await sendBillingReminders();
      console.log(`Billing reminder result:`, result);
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

console.log("Betty worker started. Waiting for jobs...");
