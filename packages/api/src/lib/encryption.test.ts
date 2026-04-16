import { describe, expect, test, beforeAll } from "bun:test";
import { randomBytes } from "crypto";

// Set a valid 64-char hex ENCRYPTION_KEY before importing
const testKey = randomBytes(32).toString("hex");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = testKey;
});

// Dynamic import so the env var is set before module loads
const { encrypt, decrypt, getLastFour } = await import("./encryption");

describe("encrypt / decrypt", () => {
  test("round-trips a PHN correctly", () => {
    const phn = "123456782";
    const encrypted = encrypt(phn);
    expect(encrypted).not.toBe(phn);
    expect(decrypt(encrypted)).toBe(phn);
  });

  test("produces different ciphertext for the same plaintext (random IV)", () => {
    const phn = "123456782";
    const a = encrypt(phn);
    const b = encrypt(phn);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(phn);
    expect(decrypt(b)).toBe(phn);
  });

  test("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  test("handles longer text", () => {
    const text = "This is a longer string for testing encryption";
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });

  test("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    // Flip a character in the base64 string
    const tampered = encrypted.slice(0, -2) + "XX";
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("getLastFour", () => {
  test("returns last 4 characters", () => {
    expect(getLastFour("123456782")).toBe("6782");
  });

  test("returns full string if shorter than 4", () => {
    expect(getLastFour("ab")).toBe("ab");
  });

  test("returns empty string for empty input", () => {
    expect(getLastFour("")).toBe("");
  });
});
