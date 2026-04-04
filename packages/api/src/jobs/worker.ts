#!/usr/bin/env bun
/**
 * BullMQ worker process. Run as a separate process:
 *   bun run packages/api/src/jobs/worker.ts
 */

import { createWorker } from "./queue";

import type { Job } from "bullmq";

import { createLogger } from "@/lib/logger";
import { processBatchSubmission } from "@/services/batch.service";

const log = createLogger({ module: "worker" });

async function processJob(job: Job): Promise<void> {
  log.info({ jobName: job.name, jobId: job.id }, "Processing job");

  switch (job.name) {
    case "batch-submit": {
      const result = await processBatchSubmission();
      log.info({ jobId: job.id, ...result }, "Batch job result");
      break;
    }

    default:
      log.warn({ jobName: job.name }, "Unknown job type");
  }
}

const worker = createWorker(processJob);

worker.on("completed", (job) => {
  log.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, "Job failed");
});

log.info("Betty worker started, waiting for jobs");
