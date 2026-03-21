import { type NextRequest, NextResponse } from "next/server";

import { verifyAccessToken } from "@/lib/auth";

export interface AuthenticatedRequest {
  userId: string;
  phone: string;
}

export async function authenticate(
  request: NextRequest
): Promise<AuthenticatedRequest | NextResponse> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    if (!payload.sub) {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 });
    }
    return { userId: payload.sub, phone: payload.phone };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export function isAuthError(result: AuthenticatedRequest | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
