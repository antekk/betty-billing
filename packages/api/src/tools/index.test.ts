import { describe, expect, it, vi } from "vitest";

// Mock dependencies used by tools
vi.mock("@/services/fee-code.service", () => ({
  searchFeeCodes: vi.fn().mockResolvedValue([]),
  getFeeCode: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  claims: {},
  timelineEntries: {},
}));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted"),
}));

import { executeTool, tools } from "./index";

interface ToolResult {
  error?: string;
  valid?: boolean;
  resolved?: boolean;
}

function parse(input: string): ToolResult {
  return JSON.parse(input) as ToolResult;
}

describe("tools index", () => {
  it("exports 4 tool definitions", () => {
    expect(tools).toHaveLength(4);
    const names = tools.map((t) => t.name);
    expect(names).toContain("fee_code_lookup");
    expect(names).toContain("validate_phn");
    expect(names).toContain("resolve_date");
    expect(names).toContain("create_claim");
  });

  it("executeTool returns error for unknown tool", async () => {
    const result = parse(await executeTool("nonexistent_tool", {}, "user-1"));
    expect(result.error).toContain("Unknown tool");
  });

  it("executeTool routes validate_phn correctly", async () => {
    const result = parse(await executeTool("validate_phn", { phn: "111111118" }, "user-1"));
    expect(result.valid).toBe(true);
  });

  it("executeTool routes resolve_date correctly", async () => {
    const result = parse(
      await executeTool(
        "resolve_date",
        { expression: "today", reference_date: "2026-03-18" },
        "user-1"
      )
    );
    expect(result.resolved).toBe(true);
  });
});
