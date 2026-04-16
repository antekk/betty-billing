import { describe, expect, test, beforeAll } from "bun:test";

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!!";
  process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-at-least-32-chars!!";
});

const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = await import(
  "./auth"
);

describe("JWT auth", () => {
  const userId = "user-123";
  const phone = "+14035551234";

  describe("access tokens", () => {
    test("sign and verify round-trip", async () => {
      const token = await signAccessToken(userId, phone);
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

      const payload = await verifyAccessToken(token);
      expect(payload.sub).toBe(userId);
      expect(payload.phone).toBe(phone);
    });

    test("rejects tampered token", async () => {
      const token = await signAccessToken(userId, phone);
      const tampered = token.slice(0, -4) + "XXXX";
      expect(verifyAccessToken(tampered)).rejects.toThrow();
    });

    test("rejects token signed with refresh secret", async () => {
      const token = await signRefreshToken(userId, phone);
      expect(verifyAccessToken(token)).rejects.toThrow();
    });
  });

  describe("refresh tokens", () => {
    test("sign and verify round-trip", async () => {
      const token = await signRefreshToken(userId, phone);
      const payload = await verifyRefreshToken(token);
      expect(payload.sub).toBe(userId);
      expect(payload.phone).toBe(phone);
    });

    test("rejects token signed with access secret", async () => {
      const token = await signAccessToken(userId, phone);
      expect(verifyRefreshToken(token)).rejects.toThrow();
    });
  });
});
