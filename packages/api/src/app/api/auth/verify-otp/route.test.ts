import { describe, expect, test, beforeEach } from "bun:test";

import { POST } from "./route";

import type { NextRequest } from "next/server";

import { otpCodes, users, timelineEntries } from "@/db/schema";
import { rateLimit, resetRateLimitStore } from "@/lib/rate-limit";
import { dbState, setSelect, setInsertReturn } from "@/test-support/fakes";

// Integration test: real rate limiter + real JWT signing, with @/db faked.

const PHONE = "+15551234567";
const VALID_BODY = { phone: PHONE, code: "123456" };
const VERIFY_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/auth/verify-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetRateLimitStore();
  setSelect(otpCodes, [{ id: "otp1" }]);
});

describe("POST /api/auth/verify-otp", () => {
  test("returns 429 with Retry-After once the per-phone attempt cap is hit", async () => {
    for (let i = 0; i < VERIFY_LIMIT.limit; i++) {
      await rateLimit(`verify-otp:${PHONE}`, VERIFY_LIMIT);
    }

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Too many attempts");
    // Short-circuits before any DB read.
    expect(dbState.selects).toHaveLength(0);
  });

  test("returns 401 when the code is invalid or expired", async () => {
    setSelect(otpCodes, []);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error.toLowerCase()).toContain("invalid");
    // OTP lookup happened; no user lookup or inserts.
    expect(dbState.selects).toHaveLength(1);
    expect(dbState.inserts).toHaveLength(0);
  });

  test("returns 400 for a bad body (wrong code length)", async () => {
    const res = await POST(makeRequest({ phone: PHONE, code: "123" }));

    expect(res.status).toBe(400);
    // Validation runs before rate limiting and DB access.
    expect(dbState.selects).toHaveLength(0);
  });

  test("valid code, NEW user: 200 with tokens, isNewUser true, welcome entry seeded", async () => {
    setSelect(users, []); // no existing user
    setInsertReturn(users, [{ id: "u1" }]);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
    };
    expect(json.isNewUser).toBe(true);
    // Real JWTs (three dot-separated segments).
    expect(json.accessToken.split(".")).toHaveLength(3);
    expect(json.refreshToken.split(".")).toHaveLength(3);

    // Inserts users first, then the welcome timeline entry for that user.
    const userInsert = dbState.inserts.find((i) => i.table === users);
    expect(userInsert?.values.phone).toBe(PHONE);
    const welcome = dbState.inserts.find((i) => i.table === timelineEntries);
    expect(welcome?.values.userId).toBe("u1");
    expect(welcome?.values.direction).toBe("outbound");
    expect((welcome?.values.content as string).length).toBeGreaterThan(0);
  });

  test("valid code, EXISTING user: 200 with isNewUser false and no inserts", async () => {
    setSelect(users, [{ id: "u1" }]);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { isNewUser: boolean; accessToken: string };
    expect(json.isNewUser).toBe(false);
    expect(json.accessToken.split(".")).toHaveLength(3);
    // No new user, no welcome entry.
    expect(dbState.inserts).toHaveLength(0);
  });
});
