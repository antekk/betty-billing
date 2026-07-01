import { describe, expect, test, beforeEach } from "bun:test";

// Force the in-memory path: ensure no Redis URL is configured before the
// module's getRedis() memoizes its (null) client on first use.
delete process.env.REDIS_URL;

// Satisfy any eager DB checks elsewhere in the import graph.
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock";

// Dynamic import AFTER env is set so the memory branch is taken.
const { rateLimit, resetRateLimitStore } = await import("./rate-limit");

describe("rateLimit (in-memory)", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  test("allows requests up to the limit, decrementing remaining each call", async () => {
    const limit = 3;
    const windowMs = 60_000;

    const first = await rateLimit("user-a", { limit, windowMs });
    expect(first.allowed).toBe(true);
    expect(first.limit).toBe(limit);
    expect(first.remaining).toBe(2);
    expect(first.retryAfterMs).toBe(0);

    const second = await rateLimit("user-a", { limit, windowMs });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
    expect(second.retryAfterMs).toBe(0);

    const third = await rateLimit("user-a", { limit, windowMs });
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterMs).toBe(0);
  });

  test("the (limit+1)-th call within the window is blocked", async () => {
    const limit = 2;
    const windowMs = 60_000;

    await rateLimit("user-b", { limit, windowMs });
    await rateLimit("user-b", { limit, windowMs });

    const blocked = await rateLimit("user-b", { limit, windowMs });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(limit);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(windowMs);
  });

  test("different keys have independent windows", async () => {
    const limit = 1;
    const windowMs = 60_000;

    // Exhaust the window for key-1.
    const k1first = await rateLimit("key-1", { limit, windowMs });
    expect(k1first.allowed).toBe(true);
    const k1second = await rateLimit("key-1", { limit, windowMs });
    expect(k1second.allowed).toBe(false);

    // key-2 must still have a fresh window.
    const k2first = await rateLimit("key-2", { limit, windowMs });
    expect(k2first.allowed).toBe(true);
    expect(k2first.remaining).toBe(0);
    expect(k2first.retryAfterMs).toBe(0);
  });

  test("remaining never goes negative on repeated over-limit calls", async () => {
    const limit = 1;
    const windowMs = 60_000;

    await rateLimit("user-c", { limit, windowMs });

    for (let i = 0; i < 5; i++) {
      const result = await rateLimit("user-c", { limit, windowMs });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  test("resetRateLimitStore clears windows so a key is fresh again", async () => {
    const limit = 1;
    const windowMs = 60_000;

    await rateLimit("user-d", { limit, windowMs });
    const blocked = await rateLimit("user-d", { limit, windowMs });
    expect(blocked.allowed).toBe(false);

    resetRateLimitStore();

    const afterReset = await rateLimit("user-d", { limit, windowMs });
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });

  test("window resets after windowMs elapses (real short window)", async () => {
    const limit = 1;
    const windowMs = 20;

    const first = await rateLimit("user-e", { limit, windowMs });
    expect(first.allowed).toBe(true);
    const blocked = await rateLimit("user-e", { limit, windowMs });
    expect(blocked.allowed).toBe(false);

    // Wait comfortably past the window so the entry is considered expired.
    await new Promise((resolve) => setTimeout(resolve, windowMs + 40));

    const afterWindow = await rateLimit("user-e", { limit, windowMs });
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(0);
    expect(afterWindow.retryAfterMs).toBe(0);
  });
});
