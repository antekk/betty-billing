/**
 * Alberta fee code format validation.
 *
 * Fee codes follow patterns like:
 * - 03.01AA (section.code + suffix)
 * - 03.01A
 * - E 1 (lab codes)
 * - 08.19A
 *
 * This validates the general format, not whether the code exists.
 */

// Matches patterns like: 03.01AA, 08.19A, 13.99B, etc.
const NUMERIC_FEE_CODE_PATTERN = /^\d{2}\.\d{2}[A-Z]{0,2}$/;

// Matches lab/path codes like: E1, E 1, E13, etc.
const ALPHA_FEE_CODE_PATTERN = /^[A-Z]\s?\d{1,4}$/;

export interface FeeCodeValidationResult {
  valid: boolean;
  normalized: string | null;
  error?: string;
}

export function validateFeeCodeFormat(input: string): FeeCodeValidationResult {
  const trimmed = input.trim().toUpperCase();

  if (NUMERIC_FEE_CODE_PATTERN.test(trimmed)) {
    return { valid: true, normalized: trimmed };
  }

  // Normalize alpha codes — remove internal spaces
  const noSpaces = trimmed.replace(/\s+/g, "");
  if (ALPHA_FEE_CODE_PATTERN.test(trimmed)) {
    return { valid: true, normalized: noSpaces };
  }

  return {
    valid: false,
    normalized: null,
    error: `"${input}" doesn't look like an Alberta fee code. Expected format like 03.01AA or E1.`,
  };
}
