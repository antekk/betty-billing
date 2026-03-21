#!/usr/bin/env bun
/**
 * BullMQ worker process. Run as a separate process:
 *   bun run packages/api/src/jobs/worker.ts
 */

import { createWorker } from "./queue";

import type { Job } from "bullmq";

import { processBatchSubmission } from "@/services/batch.service";

async function processJob(job: Job): Promise<void> {
  console.log(`Processing job: ${job.name} (${job.id})`);

  switch (job.name) {
    case "batch-submit": {
      const result = await processBatchSubmission();
      console.log(`Batch result:`, result);
      break;
    }

    default:
      console.warn(`Unknown job type: ${job.name}`);
  }
}

const worker = createWorker(processJob);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Betty worker started. Waiting for jobs...");
