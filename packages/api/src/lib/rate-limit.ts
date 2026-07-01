import Redis from "ioredis";

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Milliseconds until the window resets and the caller may retry. */
  retryAfterMs: number;
}

/**
 * Fixed-window rate limiter.
 *
 * Uses Redis when REDIS_URL is configured so the limit holds across all
 * instances (the production Cloud Run case); otherwise falls back to an
 * in-memory window, which is correct for single-instance/dev and for tests.
 */

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// Opportunistically drop expired entries so the map can't grow unbounded.
function pruneMemory(now: number): void {
  if (memoryStore.size < 10_000) return;
  for (const [key, entry] of memoryStore) {
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Map.delete, not a query
    if (entry.resetAt <= now) memoryStore.delete(key);
  }
}

function memoryRateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneMemory(now);

  let entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  entry.count += 1;
  const allowed = entry.count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterMs: allowed ? 0 : entry.resetAt - now,
  };
}

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis === undefined) {
    const url = process.env.REDIS_URL;
    redis = url ? new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true }) : null;
  }
  return redis;
}

async function redisRateLimit(
  client: Redis,
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.pexpire(redisKey, windowMs);
  }

  const allowed = count <= limit;
  let retryAfterMs = 0;
  if (!allowed) {
    const ttl = await client.pttl(redisKey);
    retryAfterMs = ttl > 0 ? ttl : windowMs;
  }

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterMs,
  };
}

/**
 * Check and consume one unit against the rate limit for `key`.
 * Every call counts as one request, whether or not it is allowed.
 */
export async function rateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const client = getRedis();
  if (client) {
    try {
      return await redisRateLimit(client, key, options);
    } catch (error) {
      // Never let a Redis hiccup take down the request path; degrade to memory.
      console.error("Rate limiter Redis error, falling back to memory:", error);
    }
  }
  return memoryRateLimit(key, options);
}

/** Test helper: clear the in-memory window store. */
export function resetRateLimitStore(): void {
  memoryStore.clear();
}
