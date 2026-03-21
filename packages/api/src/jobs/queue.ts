import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";

let connection: Redis | null = null;

function getConnection(): Redis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const QUEUE_NAME = "betty-jobs";

export function getQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: getConnection() });
}

export function createWorker(processor: (job: Job) => Promise<void>): Worker {
  return new Worker(QUEUE_NAME, processor, {
    connection: getConnection(),
    concurrency: 1,
  });
}
