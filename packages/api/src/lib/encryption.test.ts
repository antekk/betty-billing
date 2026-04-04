import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decrypt, encrypt, getLastFour } from "./encryption";

// Use a consistent test encryption key (64 hex chars = 32 bytes)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips encrypt → decrypt", () => {
    const plaintext = "123456789";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "123456789";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("encrypted output is base64", () => {
    const encrypted = encrypt("test");
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    // Re-encoding should match (valid base64 round-trips)
    expect(Buffer.from(encrypted, "base64").toString("base64")).toBe(encrypted);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    // Flip a character in the middle
    const mid = Math.floor(encrypted.length / 2);
    const tampered = encrypted.slice(0, mid) + "X" + encrypted.slice(mid + 1);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
  });

  it("throws when ENCRYPTION_KEY is wrong length", () => {
    vi.stubEnv("ENCRYPTION_KEY", "tooshort");
    expect(() => encrypt("test")).toThrow("64-character");
  });
});

describe("getLastFour", () => {
  it("returns last 4 characters", () => {
    expect(getLastFour("123456789")).toBe("6789");
  });

  it("returns full string if 4 or fewer chars", () => {
    expect(getLastFour("abc")).toBe("abc");
  });

  it("handles empty string", () => {
    expect(getLastFour("")).toBe("");
  });
});
