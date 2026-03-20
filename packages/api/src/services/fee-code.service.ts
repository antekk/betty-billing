import { db } from "@/db";
import { feeCodes } from "@/db/schema";
import { eq, ilike, or, sql, and, gte, lte } from "drizzle-orm";

export interface FeeCodeSearchResult {
  code: string;
  description: string;
  baseFee: string;
  category: string;
  rulesNotes: string | null;
  effectiveDate: string;
  endDate: string;
}

/**
 * Search fee codes by text query (searches code and description).
 */
export async function searchFeeCodes(query: string, limit = 20): Promise<FeeCodeSearchResult[]> {
  const today = new Date().toISOString().slice(0, 10);

  // Try exact code match first
  const exactMatch = await db
    .select()
    .from(feeCodes)
    .where(
      and(
        eq(feeCodes.code, query.toUpperCase()),
        lte(feeCodes.effectiveDate, today),
        gte(feeCodes.endDate, today)
      )
    )
    .limit(1);

  if (exactMatch.length > 0) {
    return exactMatch;
  }

  // Full-text search on description, or ILIKE on code
  const pattern = `%${query}%`;
  const results = await db
    .select()
    .from(feeCodes)
    .where(
      and(
        or(ilike(feeCodes.code, pattern), ilike(feeCodes.description, pattern)),
        lte(feeCodes.effectiveDate, today),
        gte(feeCodes.endDate, today)
      )
    )
    .limit(limit);

  return results;
}

/**
 * Look up a specific fee code by exact code.
 */
export async function getFeeCode(code: string): Promise<FeeCodeSearchResult | null> {
  const today = new Date().toISOString().slice(0, 10);

  const [result] = await db
    .select()
    .from(feeCodes)
    .where(
      and(
        eq(feeCodes.code, code.toUpperCase()),
        lte(feeCodes.effectiveDate, today),
        gte(feeCodes.endDate, today)
      )
    )
    .orderBy(sql`${feeCodes.effectiveDate} DESC`)
    .limit(1);

  return result || null;
}

/**
 * List fee codes by category.
 */
export async function getFeeCodesByCategory(
  category: string,
  limit = 50
): Promise<FeeCodeSearchResult[]> {
  const today = new Date().toISOString().slice(0, 10);

  return db
    .select()
    .from(feeCodes)
    .where(
      and(
        eq(feeCodes.category, category),
        lte(feeCodes.effectiveDate, today),
        gte(feeCodes.endDate, today)
      )
    )
    .limit(limit);
}
