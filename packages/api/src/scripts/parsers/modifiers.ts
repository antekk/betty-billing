/**
 * Parser for AHCIP Fee Modifiers extract file (efeemodr.txt).
 *
 * Fixed-width format:
 * - Chars 0-4:    Modifier code (5 chars, e.g., "ADD  ", "ANE  ")
 * - Char 5:       Space
 * - Chars 6-85:   Description (80 chars)
 * - Chars 86-89:  Type (4 chars, e.g., "LVP ", "ROLE")
 * - Chars 90-97:  Effective date (YYYYMMDD)
 * - Chars 98-105: End date (YYYYMMDD)
 */

export interface FeeModifier {
  code: string;
  description: string;
  type: string;
  effectiveDate: string;
  endDate: string;
}

function parseDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

export function parseModifiers(content: string): FeeModifier[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const results: FeeModifier[] = [];

  for (const line of lines) {
    if (line.length < 106) continue;

    const code = line.slice(0, 5).trim();
    if (!code) continue;

    const description = line.slice(6, 86).trim();
    const type = line.slice(86, 90).trim();
    const effectiveDate = parseDate(line.slice(90, 98));
    const endDate = parseDate(line.slice(98, 106));

    results.push({ code, description, type, effectiveDate, endDate });
  }

  return results;
}

export function getCurrentModifiers(
  modifiers: FeeModifier[],
  asOf?: string
): FeeModifier[] {
  const today = asOf || new Date().toISOString().slice(0, 10);

  const active = modifiers.filter(
    (m) => m.endDate >= today && m.effectiveDate <= today
  );

  // Deduplicate by code — keep latest
  const byCode = new Map<string, FeeModifier>();
  for (const mod of active) {
    const existing = byCode.get(mod.code);
    if (!existing || mod.effectiveDate > existing.effectiveDate) {
      byCode.set(mod.code, mod);
    }
  }

  return Array.from(byCode.values());
}
