import { type NextRequest, NextResponse } from "next/server";

import { signAccessToken, verifyRefreshToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const refreshToken = body.refreshToken;

  if (typeof refreshToken !== "string" || !refreshToken) {
    return NextResponse.json({ error: "Missing refresh token" }, { status: 400 });
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);

    if (!payload.sub) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const accessToken = await signAccessToken(payload.sub, payload.phone);

    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
  }
}
