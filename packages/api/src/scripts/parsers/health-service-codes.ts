/**
 * Parser for AHCIP Health Service Codes extract files (ehsmedbc.txt).
 *
 * Fixed-width format (115 chars per line, CRLF endings):
 * - Chars 0-6:    Fee code (7 chars, left-justified, space-padded)
 * - Chars 7-82:   Description (76 chars, may include {qualifier})
 * - Char 83:      Callable flag (Y/N)
 * - Char 84:      Space
 * - Chars 85-96:  Age range (12 digits, e.g., "050000074999" = ages 50-74.999)
 * - Chars 97-98:  Two Y/N flags
 * - Chars 99-106: Effective date (YYYYMMDD)
 * - Chars 107-114: End date (YYYYMMDD)
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
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const results: HealthServiceCode[] = [];

  for (const line of lines) {
    if (line.length < 115) continue;

    const code = line.slice(0, 7).trim();
    if (!code) continue;

    const rawDescription = line.slice(7, 83).trim();

    // Extract qualifier from {braces} if present
    let description = rawDescription;
    let qualifier: string | null = null;
    const braceMatch = /^(.*?)\s*\{(.*?)\}?\s*$/.exec(rawDescription);
    if (braceMatch) {
      description = braceMatch[1].trim();
      qualifier = braceMatch[2].trim();
    }

    const callable = line.charAt(83) === "Y";
    const effectiveDate = parseDate(line.slice(99, 107));
    const endDate = parseDate(line.slice(107, 115));

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
export function getCurrentCodes(codes: HealthServiceCode[], asOf?: string): HealthServiceCode[] {
  const today = asOf ?? new Date().toISOString().slice(0, 10);

  // Filter active codes
  const active = codes.filter((c) => c.endDate >= today && c.effectiveDate <= today);

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
