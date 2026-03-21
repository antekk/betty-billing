import { eq, and, lt, ne, desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { timelineEntries } from "@/db/schema";
import { authenticate, isAuthError } from "@/middleware/auth";

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const includeFiltered = searchParams.get("include_filtered") === "true";

  const conditions = [eq(timelineEntries.userId, auth.userId)];

  if (!includeFiltered) {
    conditions.push(ne(timelineEntries.visibility, "internal"));
    conditions.push(ne(timelineEntries.visibility, "filtered"));
  } else {
    // Always exclude internal entries from the physician's view
    conditions.push(ne(timelineEntries.visibility, "internal"));
  }

  if (before) {
    conditions.push(lt(timelineEntries.createdAt, new Date(before)));
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
