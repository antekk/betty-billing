import type { NextRequest } from "next/server";

/**
 * Client IP for rate limiting and audit logs. The last x-forwarded-for entry
 * is the one appended by the trusted proxy in front of us (Cloud Run's load
 * balancer); earlier entries are client-supplied and spoofable.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const last = xff
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (last) return last;
  }
  return "unknown";
}
