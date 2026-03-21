import { and, eq, gte } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { createSmsProvider } from "@/lib/sms";

const requestSchema = z.object({
  phone: z.string().regex(/^\+1\d{10}$/, "Phone must be in E.164 format (+1XXXXXXXXXX)"),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone } = parsed.data;

  // Rate limit: max 3 OTPs per phone per 10 minutes
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

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  await db.insert(otpCodes).values({
    phone,
    code,
    expiresAt,
  });

  const sms = createSmsProvider();
  await sms.sendOtp(phone, code);

  return NextResponse.json({ success: true });
}
