import { describe, expect, test } from "bun:test";

import { buildSystemPrompt } from "./system";

describe("buildSystemPrompt", () => {
  test("includes the current date", () => {
    const prompt = buildSystemPrompt({ currentDate: "2026-04-16" });
    expect(prompt).toContain("2026-04-16");
  });

  test("includes Betty's identity", () => {
    const prompt = buildSystemPrompt({ currentDate: "2026-04-16" });
    expect(prompt).toContain("Betty");
    expect(prompt).toContain("billing assistant");
    expect(prompt).toContain("Alberta");
  });

  test("includes physician name when provided", () => {
    const prompt = buildSystemPrompt({
      currentDate: "2026-04-16",
      userName: "Dr. Smith",
    });
    expect(prompt).toContain("Dr. Smith");
  });

  test("omits physician name when null", () => {
    const prompt = buildSystemPrompt({
      currentDate: "2026-04-16",
      userName: null,
    });
    expect(prompt).not.toContain("Physician:");
  });

  test("includes practitioner ID when provided", () => {
    const prompt = buildSystemPrompt({
      currentDate: "2026-04-16",
      practitionerId: "PRAC-001",
    });
    expect(prompt).toContain("PRAC-001");
    expect(prompt).toContain("Practitioner ID");
  });

  test("omits practitioner ID when null", () => {
    const prompt = buildSystemPrompt({
      currentDate: "2026-04-16",
      practitionerId: null,
    });
    expect(prompt).not.toContain("Practitioner ID");
  });

  test("mentions all core tool names in the instructions", () => {
    const prompt = buildSystemPrompt({ currentDate: "2026-04-16" });
    expect(prompt).toContain("fee_code_lookup");
    expect(prompt).toContain("validate_phn");
    expect(prompt).toContain("resolve_date");
    expect(prompt).toContain("create_claim");
  });

  test("includes voice guidelines about asking one question at a time", () => {
    const prompt = buildSystemPrompt({ currentDate: "2026-04-16" });
    expect(prompt).toContain("ONE question");
  });
});
