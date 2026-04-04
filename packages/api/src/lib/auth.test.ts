import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "./auth";

const TEST_JWT_SECRET = "test-jwt-secret-for-vitest-at-least-32-chars!!";
const TEST_REFRESH_SECRET = "test-refresh-secret-for-vitest-at-least-32-ch!!";

describe("auth (JWT)", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
    vi.stubEnv("JWT_REFRESH_SECRET", TEST_REFRESH_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("access tokens", () => {
    it("signs and verifies an access token", async () => {
      const token = await signAccessToken("user-123", "+14035551234");
      const payload = await verifyAccessToken(token);

      expect(payload.sub).toBe("user-123");
      expect(payload.phone).toBe("+14035551234");
    });

    it("sets expiration on access tokens", async () => {
      const token = await signAccessToken("user-123", "+14035551234");
      const payload = await verifyAccessToken(token);

      expect(payload.exp).toBeDefined();
      // Should expire in ~15 minutes
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp ?? 0;
      expect(exp - now).toBeLessThanOrEqual(15 * 60);
      expect(exp - now).toBeGreaterThan(14 * 60);
    });

    it("rejects access tokens verified with refresh secret", async () => {
      const token = await signAccessToken("user-123", "+14035551234");
      await expect(verifyRefreshToken(token)).rejects.toThrow();
    });
  });

  describe("refresh tokens", () => {
    it("signs and verifies a refresh token", async () => {
      const token = await signRefreshToken("user-456", "+14035559876");
      const payload = await verifyRefreshToken(token);

      expect(payload.sub).toBe("user-456");
      expect(payload.phone).toBe("+14035559876");
    });

    it("rejects refresh tokens verified with access secret", async () => {
      const token = await signRefreshToken("user-123", "+14035551234");
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });
  });

  it("throws when JWT_SECRET is not set", async () => {
    vi.stubEnv("JWT_SECRET", "");
    await expect(signAccessToken("user-123", "+14035551234")).rejects.toThrow();
  });
});
