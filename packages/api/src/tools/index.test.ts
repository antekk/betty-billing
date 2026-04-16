import { describe, expect, test, mock } from "bun:test";

// Mock DB layer — must intercept postgres driver to prevent connection attempt
mock.module("postgres", () => ({
  default: () => ({}),
}));

mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: () => ({
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [], orderBy: () => ({ limit: async () => [] }) }) }) }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  }),
}));

mock.module("@/lib/audit", () => ({
  auditLog: async () => {},
}));

mock.module("@/lib/encryption", () => ({
  encrypt: (v: string) => `encrypted:${v}`,
  decrypt: (v: string) => v.replace("encrypted:", ""),
}));

// Mock fee-code service to avoid DB calls
mock.module("@/services/fee-code.service", () => ({
  searchFeeCodes: async () => [],
  getFeeCode: async () => null,
}));

// Set DATABASE_URL to prevent the throw (the actual connection is mocked above)
process.env.DATABASE_URL = "postgres://mock:mock@localhost:5432/mock";

const { executeTool } = await import("./index");

describe("executeTool", () => {
  test("dispatches validate_phn to PHN handler", async () => {
    const result = JSON.parse(await executeTool("validate_phn", { phn: "123456782" }, "user-1"));
    expect(result.valid).toBe(true);
  });

  test("dispatches resolve_date to date resolution handler", async () => {
    const result = JSON.parse(
      await executeTool("resolve_date", { expression: "today" }, "user-1")
    );
    expect(result.resolved).toBe(true);
  });

  test("returns error for unknown tool", async () => {
    const result = JSON.parse(await executeTool("nonexistent_tool", {}, "user-1"));
    expect(result.error).toContain("Unknown tool");
  });

  test("dispatches fee_code_lookup", async () => {
    const result = JSON.parse(
      await executeTool("fee_code_lookup", { query: "03.01AA" }, "user-1")
    );
    // With mocked service returning empty, should report not found
    expect(result.found).toBe(false);
  });
});
