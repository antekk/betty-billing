import type { BatchStatus } from "../constants";

export interface BatchSubmission {
  id: string;
  status: BatchStatus;
  claimIds: string[];
  submittedAt: Date | null;
  completedAt: Date | null;
  responseData: Record<string, unknown> | null;
}
