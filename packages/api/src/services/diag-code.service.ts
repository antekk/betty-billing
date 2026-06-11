import { eq, ilike, or, and, gte, lte, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { diagnosticCodes } from "@/db/schema";

export type DiagnosticCodeSystem = "icd9" | "icd10";

export interface DiagnosticCodeResult {
  code: string;
  codeSystem: DiagnosticCodeSystem;
  description: string;
  enabled: boolean;
  category: string | null;
  effectiveDate: string;
  endDate: string | null;
}

interface SearchOptions {
  system?: DiagnosticCodeSystem;
  enabledOnly?: boolean;
  limit?: number;
}

/**
 * Search diagnostic codes by exact code or description keyword.
 * Filters to active rows by default (effective_date <= today, end_date null/future).
 */
export async function searchDiagnosticCodes(
  query: string,
  { system, enabledOnly = true, limit = 20 }: SearchOptions = {}
): Promise<DiagnosticCodeResult[]> {
  const today = new Date().toISOString().slice(0, 10);
  const activeRow = and(
    lte(diagnosticCodes.effectiveDate, today),
    or(isNull(diagnosticCodes.endDate), gte(diagnosticCodes.endDate, today))
  );
  const filters = [activeRow];
  if (system) filters.push(eq(diagnosticCodes.codeSystem, system));
  if (enabledOnly) filters.push(eq(diagnosticCodes.enabled, true));

  const upper = query.toUpperCase();

  const exactMatches = await db
    .select()
    .from(diagnosticCodes)
    .where(and(eq(diagnosticCodes.code, upper), ...filters))
    .limit(limit);

  if (exactMatches.length > 0) return exactMatches;

  const pattern = `%${query}%`;
  return db
    .select()
    .from(diagnosticCodes)
    .where(
      and(
        or(ilike(diagnosticCodes.code, pattern), ilike(diagnosticCodes.description, pattern)),
        ...filters
      )
    )
    .limit(limit);
}

/**
 * Look up a single diagnostic code by exact code (and optional system).
 * Returns the most recently effective active row.
 */
export async function getDiagnosticCode(
  code: string,
  system?: DiagnosticCodeSystem
): Promise<DiagnosticCodeResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const activeRow = and(
    lte(diagnosticCodes.effectiveDate, today),
    or(isNull(diagnosticCodes.endDate), gte(diagnosticCodes.endDate, today))
  );
  const filters = [eq(diagnosticCodes.code, code.toUpperCase()), activeRow];
  if (system) filters.push(eq(diagnosticCodes.codeSystem, system));

  const results = await db
    .select()
    .from(diagnosticCodes)
    .where(and(...filters))
    .orderBy(sql`${diagnosticCodes.effectiveDate} DESC`)
    .limit(1);

  return results.at(0) ?? null;
}
