export interface AHCIPClaimInput {
  id: string;
  feeCode: string;
  modifier: string | null;
  phn: string; // decrypted PHN
  serviceDate: string;
  diagnosticCode: string | null;
  practitionerId: string;
}

export interface AHCIPClaimResult {
  claimId: string;
  accepted: boolean;
  rejectionCode?: string;
  rejectionReason?: string;
}

export interface AHCIPBatchResponse {
  batchId: string;
  results: AHCIPClaimResult[];
  submittedAt: string;
}

export interface AHCIPAdapter {
  submitBatch(claims: AHCIPClaimInput[]): Promise<AHCIPBatchResponse>;
}
