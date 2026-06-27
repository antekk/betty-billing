import { describe, expect, test, beforeEach } from "bun:test";

import { POST } from "./route";

import type { NextRequest } from "next/server";

import { users, timelineEntries } from "@/db/schema";
import { signAccessToken } from "@/lib/auth";
import { rateLimit, resetRateLimitStore } from "@/lib/rate-limit";
import { setSelect, setAnthropicScripts } from "@/test-support/fakes";

// Integration test: real authenticate + real rate limiter + real processMessage,
// with only the @/db and Anthropic boundaries faked (via the preload).

const USER = { id: "u1", phone: "+15550000000" };
const CHAT_LIMIT = { limit: 20, windowMs: 60 * 1000 };

function makeRequest(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetRateLimitStore();
  setSelect(users, [{ id: USER.id, name: "Dr. Smith", ahcipPractitionerId: null }]);
  setSelect(timelineEntries, [
    { direction: "inbound", content: "hi", widgetType: null, widgetData: null },
  ]);
  setAnthropicScripts([{ deltas: ["Hel", "lo"], content: [{ type: "text", text: "Hello" }] }]);
});

describe("POST /api/chat", () => {
  test("returns 401 when the request is unauthenticated", async () => {
    const res = await POST(makeRequest({ message: "hi" }));
    expect(res.status).toBe(401);
  });

  test("returns 429 with Retry-After when the user is rate limited", async () => {
    // Exhaust the user's window so the route's own consume is over the limit.
    for (let i = 0; i < CHAT_LIMIT.limit; i++) {
      await rateLimit(`chat:${USER.id}`, CHAT_LIMIT);
    }
    const token = await signAccessToken(USER.id, USER.phone);

    const res = await POST(makeRequest({ message: "hi" }, token));

    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("too quickly");
  });

  test("returns 400 for an invalid body (empty message)", async () => {
    const token = await signAccessToken(USER.id, USER.phone);
    const res = await POST(makeRequest({ message: "" }, token));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error.length).toBeGreaterThan(0);
  });

  test("happy path: 200 SSE stream carrying the streamed deltas and done event", async () => {
    const token = await signAccessToken(USER.id, USER.phone);
    const res = await POST(makeRequest({ message: "hi" }, token));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");

    const text = await res.text();
    expect(text).toContain("event: delta");
    expect(text).toContain('data: {"text":"Hel"}');
    expect(text).toContain('data: {"text":"lo"}');
    expect(text).toContain("event: done");
    expect(text).toContain('data: {"text":"Hello"}');
  });

  test("a failure inside processMessage closes the stream with an SSE error frame", async () => {
    // No matching user -> processMessage throws -> route's catch emits an error.
    setSelect(users, []);
    const token = await signAccessToken(USER.id, USER.phone);

    const res = await POST(makeRequest({ message: "hi" }, token));

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: error\ndata: {"message":"An unexpected error occurred"}');
  });
});
