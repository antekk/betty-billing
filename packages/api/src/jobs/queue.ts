import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";

let connection: Redis | null = null;
let queue: Queue | null = null;

function getConnection(): Redis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const QUEUE_NAME = "betty-jobs";

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, { connection: getConnection() });
  return queue;
}

export function createWorker(processor: (job: Job) => Promise<void>): Worker {
  return new Worker(QUEUE_NAME, processor, {
    connection: getConnection(),
    concurrency: 1,
  });
}

/** Close the shared queue and Redis connection (for graceful shutdown). */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
