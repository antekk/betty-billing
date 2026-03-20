/**
 * Alberta Personal Health Number (PHN) validation.
 *
 * Alberta PHNs are 9 digits. The last digit is a check digit
 * calculated using a Luhn mod-10 algorithm variant.
 */

const PHN_LENGTH = 9;

export interface PhnValidationResult {
  valid: boolean;
  formatted: string | null;
  last4: string | null;
  error?: string;
}

export function validatePhn(input: string): PhnValidationResult {
  // Strip whitespace and dashes
  const cleaned = input.replace(/[\s-]/g, "");

  if (!/^\d+$/.test(cleaned)) {
    return {
      valid: false,
      formatted: null,
      last4: null,
      error: "PHN must contain only digits",
    };
  }

  if (cleaned.length !== PHN_LENGTH) {
    return {
      valid: false,
      formatted: null,
      last4: null,
      error: `PHN must be ${PHN_LENGTH} digits (got ${cleaned.length})`,
    };
  }

  if (!luhnCheck(cleaned)) {
    return {
      valid: false,
      formatted: null,
      last4: cleaned.slice(-4),
      error: "PHN check digit is invalid",
    };
  }

  return {
    valid: true,
    formatted: cleaned,
    last4: cleaned.slice(-4),
  };
}

/**
 * Standard Luhn mod-10 check digit validation.
 */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);

    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }

    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}
