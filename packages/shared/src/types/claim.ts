import type { ClaimStatus } from "../constants";

export interface Claim {
  id: string;
  userId: string;
  timelineEntryId: string | null;
  status: ClaimStatus;
  feeCode: string;
  modifier: string | null;
  phn: string; // encrypted at rest
  phnLast4: string;
  patientName: string | null;
  serviceDate: string; // ISO date
  diagnosticCode: string | null;
  expectedFee: string; // decimal as string
  rejectionReason: string | null;
  submittedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimConfirmationData {
  type: "claim_confirmation";
  claimId: string;
  patientName: string | null;
  phnLast4: string;
  feeCode: string;
  feeCodeDescription: string;
  modifier: string | null;
  serviceDate: string;
  serviceDateFormatted: string;
  expectedFee: string;
  status: ClaimStatus;
}

export interface ActionCardData {
  type: "action_card";
  title: string;
  body: string;
  claimId?: string;
  actions: Array<{
    label: string;
    action: string; // e.g., "view_claim", "add_diagnostic_code", "send_message"
    payload?: Record<string, unknown>;
  }>;
}
