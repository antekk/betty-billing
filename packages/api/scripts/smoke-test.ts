#!/usr/bin/env bun
/**
 * End-to-end smoke test for the Betty API.
 *
 * Assumes:
 *   - Next.js server is running at SMOKE_BASE_URL (default http://localhost:3000)
 *   - Postgres is reachable at DATABASE_URL
 *   - Schema has been applied (drizzle-kit push or migrate)
 *   - SMS provider is the mock (so OTP codes live in the database)
 *
 * Exercises the critical path:
 *   1. GET /api/health                  → 200
 *   2. POST /api/auth/request-otp       → 200 (writes OTP row)
 *   3. Read OTP directly from DB        (mock provider doesn't deliver)
 *   4. POST /api/auth/verify-otp        → returns { accessToken, refreshToken, isNewUser }
 *   5. GET /api/timeline with Bearer    → returns welcome message entry
 *   6. GET /api/fee-codes (unauth)      → 401 (authz gate works)
 *
 * Exits 0 on success, non-zero on any failure.
 */

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { otpCodes, timelineEntries, users } from "../src/db/schema";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} must be set`);
    process.exit(1);
  }
  return value;
}

const DATABASE_URL = requireEnv("DATABASE_URL");

// Use a uniquely-generated phone per run so tests don't collide
const lastTen = String(Date.now()).slice(-10);
const TEST_PHONE = `+1${lastTen}`;

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: StepResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const icon = ok ? "OK " : "FAIL";
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE_URL}`);
  console.log(`Test phone: ${TEST_PHONE}`);

  // Wait for the server to be up before starting
  await waitForServer(BASE_URL);

  const client = postgres(DATABASE_URL, { max: 2 });
  const db = drizzle(client);

  try {
    // --- Step 1: health endpoint ---
    {
      const res = await fetch(`${BASE_URL}/api/health`);
      const body = (await res.json()) as { status?: string };
      const ok = res.status === 200 && body.status === "ok";
      record("GET /api/health returns 200 with status:ok", ok, `status=${res.status}`);
      if (!ok) throw new Error("health check failed");
    }

    // --- Step 2: request OTP ---
    {
      const res = await fetch(`${BASE_URL}/api/auth/request-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: TEST_PHONE }),
      });
      const ok = res.status === 200;
      record("POST /api/auth/request-otp returns 200", ok, `status=${res.status}`);
      if (!ok) throw new Error("request-otp failed");
    }

    // --- Step 3: read the OTP from the DB (mock provider) ---
    const otpRows = await db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.phone, TEST_PHONE))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    const otp = otpRows.at(0);
    record("OTP row persisted in DB", Boolean(otp), otp ? `code=${otp.code}` : "no row found");
    if (!otp) throw new Error("no OTP in DB");

    // --- Step 4: verify OTP → tokens ---
    let accessToken: string;
    {
      const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: TEST_PHONE, code: otp.code }),
      });
      const body = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        isNewUser?: boolean;
      };
      const ok =
        res.status === 200 &&
        typeof body.accessToken === "string" &&
        typeof body.refreshToken === "string" &&
        body.isNewUser === true;
      record(
        "POST /api/auth/verify-otp returns tokens for new user",
        ok,
        `status=${res.status} isNewUser=${String(body.isNewUser)}`
      );
      if (!ok || !body.accessToken) throw new Error("verify-otp failed");
      accessToken = body.accessToken;
    }

    // --- Step 5: timeline returns welcome message ---
    {
      const res = await fetch(`${BASE_URL}/api/timeline`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const body = (await res.json()) as {
        entries?: { content?: string | null; direction?: string }[];
      };
      const hasWelcome = body.entries?.some(
        (e) => e.direction === "outbound" && (e.content ?? "").includes("Betty")
      );
      const ok = res.status === 200 && Boolean(hasWelcome);
      record(
        "GET /api/timeline returns welcome message",
        ok,
        `status=${res.status} entries=${String(body.entries?.length ?? 0)}`
      );
      if (!ok) throw new Error("timeline fetch failed");
    }

    // --- Step 6: unauthenticated request is rejected ---
    {
      const res = await fetch(`${BASE_URL}/api/timeline`);
      const ok = res.status === 401;
      record("GET /api/timeline without token returns 401", ok, `status=${res.status}`);
      if (!ok) throw new Error("authz gate is broken");
    }

    // --- Cleanup: remove test user so reruns are idempotent ---
    const testUser = await db.select().from(users).where(eq(users.phone, TEST_PHONE)).limit(1);
    if (testUser[0]) {
      await db.delete(timelineEntries).where(eq(timelineEntries.userId, testUser[0].id));
      await db.delete(users).where(eq(users.id, testUser[0].id));
    }
    await db.delete(otpCodes).where(eq(otpCodes.phone, TEST_PHONE));
  } finally {
    await client.end();
  }

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} steps passed`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("\nSmoke test failed:", err);
  process.exit(1);
});
