import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { verifyRefreshToken } from "@/lib/auth";
import { getClientIp } from "@/lib/request";

/**
 * Revoke the session behind a refresh token. Always answers 200 — logout must
 * never fail visibly, and an invalid token has nothing left to revoke.
 */
export async function POST(request: NextRequest) {
  let refreshToken: unknown;
  try {
    refreshToken = ((await request.json()) as Record<string, unknown>).refreshToken;
  } catch {
    return NextResponse.json({ success: true });
  }
  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json({ success: true });
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    if (payload.sub && typeof payload.jti === "string") {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.id, payload.jti),
            eq(sessions.userId, payload.sub),
            isNull(sessions.revokedAt)
          )
        );
      await auditLog(
        payload.sub,
        "session_revoked",
        "session",
        payload.jti,
        { reason: "logout" },
        getClientIp(request)
      );
    }
  } catch {
    // Expired/invalid token — nothing to revoke
  }

  return NextResponse.json({ success: true });
}
