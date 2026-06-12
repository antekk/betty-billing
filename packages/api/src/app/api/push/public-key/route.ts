import { NextResponse } from "next/server";

import { getVapidPublicKey } from "@/lib/push";

/**
 * VAPID public key for client-side push subscription.
 * Returns enabled=false when push isn't configured so the UI can hide itself.
 */
export function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ enabled: !!publicKey, publicKey });
}
