import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";

/**
 * Liveness + DB reachability. Without the DB probe this reported healthy
 * while every real request failed against an empty/unreachable database.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
