import { describe, expect, test, beforeEach } from "bun:test";

import { MockAHCIPAdapter } from "./mock";

import { createAHCIPAdapter } from "./index";

describe("createAHCIPAdapter", () => {
  beforeEach(() => {
    delete process.env.AHCIP_ADAPTER;
  });

  test("defaults to MockAHCIPAdapter when env not set", () => {
    const adapter = createAHCIPAdapter();
    expect(adapter).toBeInstanceOf(MockAHCIPAdapter);
  });

  test("returns MockAHCIPAdapter when AHCIP_ADAPTER=mock", () => {
    process.env.AHCIP_ADAPTER = "mock";
    const adapter = createAHCIPAdapter();
    expect(adapter).toBeInstanceOf(MockAHCIPAdapter);
  });

  test("throws for unknown adapter type", () => {
    process.env.AHCIP_ADAPTER = "hlink";
    expect(() => createAHCIPAdapter()).toThrow("Unknown AHCIP adapter: hlink");
  });
});
