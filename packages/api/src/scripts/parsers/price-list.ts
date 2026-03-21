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
 * - Chars 14-21:  Record ID (8 digits)
 * - Chars 22-31:  Effective date (YYYY-MM-DD)
 * - Chars 32-41:  End date (YYYY-MM-DD)
 * - Spaces (padding)
 * - Last 9 chars:  Fee in cents (right-justified, e.g., "000001853" = $18.53)
 *
 * Type 2 (modifier/surcharge):
 * - Char 0:       Record type ("2")
 * - Chars 1-7:    Fee code (7 chars)
 * - Chars 8-12:   Discipline + Program
 * - Space
 * - Chars 14-23:  Modifier/surcharge type (e.g., "SURTTDES  ", "TIMETM    ")
 * - Chars 24-31:  Record ID
 * - Chars 32-41:  Effective date
 * - Chars 42-51:  End date
 * - Chars 52-56:  Limit value (5 digits)
 * - Char 57:      Limit type (S=session, I=individual, etc.)
 * - Char 58:      Operation (+, *, R)
 * - Chars 59-67:  Amount in cents (9 digits)
 * - Chars 68-76:  Secondary amount (9 digits)
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
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const prices: PriceRecord[] = [];
  const modifiers: ModifierRecord[] = [];

  for (const line of lines) {
    if (line.length < 42) continue;

    const recordType = line.charAt(0);
    const code = line.slice(1, 8).trim();
    const discipline = line.slice(8, 13).trim();

    if (recordType === "1") {
      const effectiveDate = line.slice(22, 32).trim();
      const endDate = line.slice(32, 42).trim();
      // Fee is the last 9 digits
      const feeStr = line.slice(-9).trim();
      const baseFee = parseInt(feeStr, 10) || 0;

      prices.push({ code, discipline, baseFee, effectiveDate, endDate });
    } else if (recordType === "2" && line.length >= 68) {
      const modifierType = line.slice(14, 24).trim();
      const effectiveDate = line.slice(32, 42).trim();
      const endDate = line.slice(42, 52).trim();
      const limit = parseInt(line.slice(52, 57), 10) || 0;
      const operation = line.charAt(58);
      const amount = parseInt(line.slice(59, 68), 10) || 0;

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
