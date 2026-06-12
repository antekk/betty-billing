import { type NextRequest, NextResponse } from "next/server";

import { authenticate, isAuthError } from "@/middleware/auth";
import { cancelClaimForUser } from "@/services/claim.service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const result = await cancelClaimForUser(id, auth.userId);

  if (!result.cancelled) {
    const status = result.error === "Claim not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true, status: "cancelled" });
}
