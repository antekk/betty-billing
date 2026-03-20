import type { AHCIPAdapter } from "./interface";
import { MockAHCIPAdapter } from "./mock";

export function createAHCIPAdapter(): AHCIPAdapter {
  const mode = process.env.AHCIP_ADAPTER || "mock";

  switch (mode) {
    case "mock":
      return new MockAHCIPAdapter();
    default:
      throw new Error(
        `Unknown AHCIP adapter: ${mode}. Only "mock" is supported in v1.`
      );
  }
}

export type { AHCIPAdapter, AHCIPClaimInput, AHCIPBatchResponse, AHCIPClaimResult } from "./interface";
