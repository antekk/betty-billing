import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Cryptographically random 6-digit login code. */
export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

/** Codes are stored hashed so a database leak never exposes live login codes. */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function otpCodeMatches(code: string, codeHash: string): boolean {
  const candidate = Buffer.from(hashOtpCode(code), "hex");
  const stored = Buffer.from(codeHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
