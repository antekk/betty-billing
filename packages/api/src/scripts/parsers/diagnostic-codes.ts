/**
 * Parser for AHCIP Diagnostic Codes file (diagcode.txt).
 *
 * Fixed-width format:
 * - Chars 0-5:    Code (e.g., "V01.0 ", "001   ")
 * - Chars 6-65:   Description (60 chars)
 * - Chars 66-73:  Effective date (YYYYMMDD)
 * - Chars 74-81:  End date (YYYYMMDD)
 */

export interface DiagnosticCode {
  code: string;
  description: string;
  effectiveDate: string;
  endDate: string;
}

function parseDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

export function parseDiagnosticCodes(content: string): DiagnosticCode[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const results: DiagnosticCode[] = [];

  for (const line of lines) {
    if (line.length < 82) continue;

    const code = line.slice(0, 6).trim();
    if (!code) continue;

    const description = line.slice(6, 66).trim();
    const effectiveDate = parseDate(line.slice(66, 74));
    const endDate = parseDate(line.slice(74, 82));

    results.push({ code, description, effectiveDate, endDate });
  }

  return results;
}
