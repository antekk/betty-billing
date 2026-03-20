/**
 * Parser for AHCIP Health Service Codes extract files (ehsmedbc.txt).
 *
 * Fixed-width format:
 * - Chars 0-6:    Fee code (7 chars, left-justified, space-padded)
 * - Chars 7-86:   Description (80 chars, may include {qualifier})
 * - Char 87:      Callable flag (Y/N)
 * - Char 88:      Space
 * - Chars 89-100: Age range (12 digits, e.g., "050000074999" = ages 50-74.999)
 * - Chars 101-102: Two Y/N flags
 * - Chars 103-110: Effective date (YYYYMMDD)
 * - Chars 111-118: End date (YYYYMMDD)
 */

export interface HealthServiceCode {
  code: string;
  description: string;
  qualifier: string | null;
  callable: boolean;
  effectiveDate: string; // ISO date
  endDate: string; // ISO date
}

function parseDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

export function parseHealthServiceCodes(content: string): HealthServiceCode[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const results: HealthServiceCode[] = [];

  for (const line of lines) {
    if (line.length < 119) continue;

    const code = line.slice(0, 7).trim();
    if (!code) continue;

    const rawDescription = line.slice(7, 87).trim();

    // Extract qualifier from {braces} if present
    let description = rawDescription;
    let qualifier: string | null = null;
    const braceMatch = rawDescription.match(/^(.*?)\s*\{(.*?)\}?\s*$/);
    if (braceMatch) {
      description = braceMatch[1].trim();
      qualifier = braceMatch[2].trim();
    }

    const callable = line.charAt(87) === "Y";
    const effectiveDate = parseDate(line.slice(103, 111));
    const endDate = parseDate(line.slice(111, 119));

    results.push({
      code,
      description,
      qualifier,
      callable,
      effectiveDate,
      endDate,
    });
  }

  return results;
}

/**
 * Filter to only currently active codes (end_date >= today).
 * When multiple versions exist for the same code, take the latest effective one.
 */
export function getCurrentCodes(
  codes: HealthServiceCode[],
  asOf?: string
): HealthServiceCode[] {
  const today = asOf || new Date().toISOString().slice(0, 10);

  // Filter active codes
  const active = codes.filter(
    (c) => c.endDate >= today && c.effectiveDate <= today
  );

  // Deduplicate: keep the latest effective date per code
  const byCode = new Map<string, HealthServiceCode>();
  for (const code of active) {
    const existing = byCode.get(code.code);
    if (!existing || code.effectiveDate > existing.effectiveDate) {
      byCode.set(code.code, code);
    }
  }

  return Array.from(byCode.values());
}
