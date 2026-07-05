import { and, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { otpCodes, users, timelineEntries, sessions } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { signAccessToken, signRefreshToken } from "@/lib/auth";
import { otpCodeMatches } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const verifySchema = z.object({
  phone: z.string().regex(/^\+1\d{10}$/),
  code: z.string().length(6),
});

// Cap verification attempts per phone so a 6-digit code can't be brute-forced.
const VERIFY_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

const WELCOME_MESSAGE = `Hi, I'm Betty — your billing assistant. I know Alberta fee codes inside and out. Ask me anything, or when you're ready, I can start handling your claims too.

What can I help with?`;

export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const body = await request.json();
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone, code } = parsed.data;

  const rl = await rateLimit(`verify-otp:${phone}`, VERIFY_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please request a new code and wait a few minutes." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } }
    );
  }

  // Load unexpired, unused codes for this phone; the hash comparison happens
  // here (constant-time), not in the WHERE clause.
  const candidateRows = await db
    .select()
    .from(otpCodes)
    .where(
      and(eq(otpCodes.phone, phone), eq(otpCodes.used, false), gt(otpCodes.expiresAt, new Date()))
    )
    .limit(5);

  const otp = candidateRows.find((row) => otpCodeMatches(code, row.codeHash));
  if (!otp) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  // Atomic redeem: the used=false guard means two concurrent requests with the
  // same code can't both succeed.
  const redeemed = await db
    .update(otpCodes)
    .set({ used: true })
    .where(and(eq(otpCodes.id, otp.id), eq(otpCodes.used, false)))
    .returning({ id: otpCodes.id });
  if (redeemed.length === 0) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  // Upsert user
  const existingUserRows = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const existingUser = existingUserRows.at(0);

  let userId: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Two first-time verifications can race on the phone unique constraint —
    // ON CONFLICT DO NOTHING makes the loser fall through to a re-read.
    const inserted = await db
      .insert(users)
      .values({ phone })
      .onConflictDoNothing({ target: users.phone })
      .returning({ id: users.id });
    const newUser = inserted.at(0);

    if (newUser) {
      userId = newUser.id;
      isNewUser = true;

      // Seed welcome message for new users
      await db.insert(timelineEntries).values({
        userId,
        type: "message",
        direction: "outbound",
        content: WELCOME_MESSAGE,
        visibility: "default",
        importanceFlag: false,
      });
    } else {
      const raceRows = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      const raceUser = raceRows.at(0);
      if (!raceUser) {
        return NextResponse.json({ error: "Could not create account" }, { status: 500 });
      }
      userId = raceUser.id;
    }
  }

  await auditLog(userId, "login", "user", userId, { isNewUser }, getClientIp(request));

  // A server-side session row backs the refresh token (rotation/revocation)
  const [session] = await db
    .insert(sessions)
    .values({ userId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
    .returning({ id: sessions.id });

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId, phone),
    signRefreshToken(userId, phone, session.id),
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    isNewUser,
  });
}
