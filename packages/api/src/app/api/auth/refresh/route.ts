import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth";
import { getClientIp } from "@/lib/request";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const refreshToken = body.refreshToken;

  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json({ error: "Missing refresh token" }, { status: 400 });
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);

    if (!payload.sub || typeof payload.jti !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, payload.jti))
      .limit(1);
    const session = sessionRows.at(0);

    if (session?.userId !== payload.sub || session.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    if (session.revokedAt) {
      // A rotated-away token is being replayed — assume theft and revoke
      // every active session for this user.
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, payload.sub), isNull(sessions.revokedAt)));
      await auditLog(
        payload.sub,
        "session_revoked",
        "session",
        session.id,
        { reason: "refresh_token_reuse" },
        getClientIp(request)
      );
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    // Rotate: issue a replacement session (inheriting the absolute expiry so
    // a login can't be extended forever), then retire this one. The
    // revoked_at-guarded update makes concurrent refreshes race safely — the
    // loser's replacement is revoked and it gets a 401.
    const [next] = await db
      .insert(sessions)
      .values({ userId: payload.sub, expiresAt: session.expiresAt })
      .returning({ id: sessions.id });

    const retired = await db
      .update(sessions)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    if (retired.length === 0) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, next.id));
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    const [accessToken, rotatedRefreshToken] = await Promise.all([
      signAccessToken(payload.sub, payload.phone),
      signRefreshToken(payload.sub, payload.phone, next.id),
    ]);

    return NextResponse.json({ accessToken, refreshToken: rotatedRefreshToken });
  } catch {
    return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
  }
}
