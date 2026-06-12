"use client";

import { useState } from "react";

interface ClaimConfirmationData {
  claimId: string;
  patientName?: string;
  phnLast4?: string;
  feeCode: string;
  feeCodeDescription?: string;
  modifier?: string;
  serviceDate: string;
  serviceDateFormatted?: string;
  expectedFee: number | string;
  status: string;
}

interface ClaimConfirmationProps {
  data: ClaimConfirmationData;
  onConfirm: (claimId: string) => Promise<void>;
  onCancel?: (claimId: string) => Promise<void>;
}

export function ClaimConfirmation({ data, onConfirm, onCancel }: ClaimConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const isCancelled = data.status === "cancelled";
  const isPending = data.status === "pending_confirmation";

  async function handleConfirm() {
    setIsLoading(true);
    try {
      await onConfirm(data.claimId);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel(data.claimId);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="mx-4 my-1 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-separator px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {isCancelled
            ? "Claim Cancelled"
            : isPending
              ? "Claim Ready to Submit"
              : "Claim Submitted"}
        </h3>
      </div>

      <div className="space-y-2 px-4 py-3 text-sm">
        {data.patientName && (
          <Row
            label="Patient"
            value={`${data.patientName}${data.phnLast4 ? ` (•••${data.phnLast4})` : ""}`}
          />
        )}
        <Row
          label="Service"
          value={`${data.feeCode}${data.feeCodeDescription ? ` – ${data.feeCodeDescription}` : ""}`}
        />
        {data.modifier && <Row label="Modifier" value={data.modifier} />}
        <Row label="Date" value={data.serviceDateFormatted ?? data.serviceDate} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-text-secondary">Expected Fee</span>
          <span className="text-lg font-bold text-text-primary">
            ${Number(data.expectedFee).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="border-t border-separator px-4 py-3">
        {isCancelled ? (
          <div className="flex items-center justify-center rounded-lg bg-border py-2 text-sm font-medium text-text-secondary">
            Cancelled
          </div>
        ) : isPending ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                void handleConfirm();
              }}
              disabled={isLoading || isCancelling}
              className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
            >
              {isLoading ? "Confirming..." : "Confirm & Stage"}
            </button>
            {onCancel && (
              <button
                onClick={() => {
                  void handleCancel();
                }}
                disabled={isLoading || isCancelling}
                className="w-full py-1 text-xs font-medium text-text-tertiary active:text-text-secondary disabled:opacity-60"
              >
                {isCancelling ? "Cancelling..." : "Cancel this claim"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-success-bg py-2 text-sm font-medium text-success">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
            Confirmed
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-text-secondary">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}
