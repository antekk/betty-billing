import { and, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { otpCodes, users, timelineEntries } from "@/db/schema";
import { signAccessToken, signRefreshToken } from "@/lib/auth";

const verifySchema = z.object({
  phone: z.string().regex(/^\+1\d{10}$/),
  code: z.string().length(6),
});

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

  // Find valid, unused OTP
  const otpRows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        eq(otpCodes.code, code),
        eq(otpCodes.used, false),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  const otp = otpRows.at(0);
  if (!otp) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  // Mark OTP as used
  await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, otp.id));

  // Upsert user
  const existingUserRows = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const existingUser = existingUserRows.at(0);

  let userId: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const [newUser] = await db.insert(users).values({ phone }).returning({ id: users.id });
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
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId, phone),
    signRefreshToken(userId, phone),
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    isNewUser,
  });
}
