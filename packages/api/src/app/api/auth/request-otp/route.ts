import { and, eq, gte, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { generateOtpCode, hashOtpCode } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { createSmsProvider } from "@/lib/sms";

const requestSchema = z.object({
  phone: z.string().regex(/^\+1\d{10}$/, "Phone must be in E.164 format (+1XXXXXXXXXX)"),
});

// Per-IP cap is deliberately looser than per-phone: it stops one client
// spraying codes across many numbers (SMS bombing / toll fraud).
const IP_RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const PHONE_RATE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone } = parsed.data;
  const ip = getClientIp(request);

  const ipLimit = await rateLimit(`request-otp-ip:${ip}`, IP_RATE_LIMIT);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many OTP requests. Please wait a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(ipLimit.retryAfterMs / 1000).toString() },
      }
    );
  }

  const phoneLimit = await rateLimit(`request-otp:${phone}`, PHONE_RATE_LIMIT);
  if (!phoneLimit.allowed) {
    return NextResponse.json(
      { error: "Too many OTP requests. Please wait a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(phoneLimit.retryAfterMs / 1000).toString() },
      }
    );
  }

  // Defense in depth: a DB-backed per-phone cap that survives instance
  // restarts (the limiter above can be per-instance without Redis).
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentOtps = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gte(otpCodes.createdAt, tenMinutesAgo)));

  if (recentOtps.length >= 3) {
    return NextResponse.json(
      { error: "Too many OTP requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  // Only the newest code is valid — invalidate outstanding ones, and purge
  // rows long past expiry so the table doesn't grow forever.
  await db
    .update(otpCodes)
    .set({ used: true })
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.used, false)));
  await db
    .delete(otpCodes)
    .where(lt(otpCodes.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

  await db.insert(otpCodes).values({
    phone,
    codeHash: hashOtpCode(code),
    expiresAt,
  });

  try {
    const sms = createSmsProvider();
    await sms.sendOtp(phone, code);
  } catch (error) {
    console.error("Failed to send OTP:", error);
    return NextResponse.json(
      { error: "Could not send the code. Please try again." },
      { status: 502 }
    );
  }

  await auditLog(null, "otp_requested", "auth", null, { phoneLast4: phone.slice(-4) }, ip);

  return NextResponse.json({ success: true });
}
