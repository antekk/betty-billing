import { eq, and, lt, ne, desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { timelineEntries } from "@/db/schema";
import { authenticate, isAuthError } from "@/middleware/auth";

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const includeFiltered = searchParams.get("include_filtered") === "true";

  const beforeParam = searchParams.get("before");
  let before: Date | null = null;
  if (beforeParam) {
    before = new Date(beforeParam);
    if (isNaN(before.getTime())) {
      return NextResponse.json({ error: "Invalid 'before' timestamp" }, { status: 400 });
    }
  }

  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

  const conditions = [eq(timelineEntries.userId, auth.userId)];

  if (!includeFiltered) {
    conditions.push(ne(timelineEntries.visibility, "internal"));
    conditions.push(ne(timelineEntries.visibility, "filtered"));
  } else {
    // Always exclude internal entries from the physician's view
    conditions.push(ne(timelineEntries.visibility, "internal"));
  }

  if (before) {
    conditions.push(lt(timelineEntries.createdAt, before));
  }

  const entries = await db
    .select()
    .from(timelineEntries)
    .where(and(...conditions))
    .orderBy(desc(timelineEntries.createdAt))
    .limit(limit);

  return NextResponse.json({
    entries: entries.reverse(), // Return in chronological order
    hasMore: entries.length === limit,
  });
}
