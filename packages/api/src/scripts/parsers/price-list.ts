/**
 * Parser for AHCIP Price List extract files (epcmedbc.txt).
 *
 * Two record types:
 *
 * Type 1 (base price):
 * - Char 0:       Record type ("1")
 * - Chars 1-7:    Fee code (7 chars)
 * - Chars 8-12:   Discipline + Program (e.g., "MEDDS")
 * - Space
 * - Chars 14-23:  Record ID (10 digits)
 * - Chars 24-33:  Effective date (YYYY-MM-DD)
 * - Chars 34-43:  End date (YYYY-MM-DD)
 * - Spaces (padding)
 * - Last 9 chars:  Fee in cents (right-justified, e.g., "000001853" = $18.53)
 *
 * Type 2 (modifier/surcharge):
 * - Char 0:       Record type ("2")
 * - Chars 1-7:    Fee code (7 chars)
 * - Chars 8-12:   Discipline + Program
 * - Space
 * - Chars 14-23:  Modifier/surcharge type (e.g., "SURTTDES  ", "TIMETM    ")
 * - Chars 24-33:  Record ID (10 digits)
 * - Chars 34-43:  Effective date
 * - Chars 44-53:  End date
 * - Chars 54-58:  Limit value (5 digits)
 * - Char 59:      Limit type (S=session, I=individual, etc.)
 * - Char 60:      Operation (+, *, R)
 * - Chars 61-69:  Amount in cents (9 digits)
 * - Chars 70-78:  Secondary amount (9 digits)
 */

export interface PriceRecord {
  code: string;
  discipline: string;
  baseFee: number; // in cents
  effectiveDate: string;
  endDate: string;
}

export interface ModifierRecord {
  code: string;
  discipline: string;
  modifierType: string;
  effectiveDate: string;
  endDate: string;
  limit: number;
  operation: string;
  amount: number; // in cents
}

export function parsePriceList(content: string): {
  prices: PriceRecord[];
  modifiers: ModifierRecord[];
} {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const prices: PriceRecord[] = [];
  const modifiers: ModifierRecord[] = [];

  for (const line of lines) {
    if (line.length < 44) continue;

    const recordType = line.charAt(0);
    const code = line.slice(1, 8).trim();
    const discipline = line.slice(8, 13).trim();

    if (recordType === "1") {
      const effectiveDate = line.slice(24, 34).trim();
      const endDate = line.slice(34, 44).trim();
      // Fee is the last 9 digits
      const feeStr = line.slice(-9).trim();
      const baseFee = parseInt(feeStr, 10) || 0;

      prices.push({ code, discipline, baseFee, effectiveDate, endDate });
    } else if (recordType === "2" && line.length >= 70) {
      const modifierType = line.slice(14, 24).trim();
      const effectiveDate = line.slice(34, 44).trim();
      const endDate = line.slice(44, 54).trim();
      const limit = parseInt(line.slice(54, 59), 10) || 0;
      const operation = line.charAt(60);
      const amount = parseInt(line.slice(61, 70), 10) || 0;

      modifiers.push({
        code,
        discipline,
        modifierType,
        effectiveDate,
        endDate,
        limit,
        operation,
        amount,
      });
    }
  }

  return { prices, modifiers };
}

/**
 * Get current prices (end_date >= today), latest effective per code.
 */
export function getCurrentPrices(prices: PriceRecord[], asOf?: string): Map<string, PriceRecord> {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const byCode = new Map<string, PriceRecord>();

  for (const price of prices) {
    if (price.endDate < today || price.effectiveDate > today) continue;

    const existing = byCode.get(price.code);
    if (!existing || price.effectiveDate > existing.effectiveDate) {
      byCode.set(price.code, price);
    }
  }

  return byCode;
}
