"use client";

import { useState } from "react";

interface ClaimUpdateChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

interface ClaimUpdateConfirmationData {
  claimId: string;
  timelineEntryId?: string;
  applied?: boolean;
  changes: ClaimUpdateChange[];
  current: {
    feeCode: string;
    feeCodeDescription?: string;
    expectedFee: number | string;
  };
  reason?: string | null;
  status: string;
}

interface ClaimUpdateConfirmationProps {
  data: ClaimUpdateConfirmationData;
  onApply: (claimId: string, timelineEntryId: string) => Promise<void>;
}

export function ClaimUpdateConfirmation({ data, onApply }: ClaimUpdateConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isApplied = data.applied === true;
  const canApply = !isApplied && !!data.timelineEntryId;

  async function handleApply() {
    if (!data.timelineEntryId) return;
    setIsLoading(true);
    try {
      await onApply(data.claimId, data.timelineEntryId);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-4 my-1 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-separator px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {isApplied ? "Claim Updated" : "Proposed Update"}
        </h3>
        {data.reason && <p className="mt-0.5 text-xs text-text-secondary">{data.reason}</p>}
      </div>

      <div className="space-y-2 px-4 py-3 text-sm">
        {data.changes.map((change) => (
          <div key={change.field} className="flex items-start justify-between gap-4">
            <span className="shrink-0 text-text-secondary">{change.label}</span>
            <span className="text-right text-text-primary">
              <span className="text-text-tertiary line-through">{change.before ?? "—"}</span>
              {" → "}
              <span className="font-medium">{change.after ?? "—"}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <span className="text-text-secondary">Expected Fee</span>
          <span className="text-lg font-bold text-text-primary">
            {formatFee(data.current.expectedFee)}
          </span>
        </div>
      </div>

      <div className="border-t border-separator px-4 py-3">
        {isApplied ? (
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
            Applied
          </div>
        ) : (
          <button
            onClick={() => {
              void handleApply();
            }}
            disabled={isLoading || !canApply}
            className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {isLoading ? "Applying..." : "Apply Update"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatFee(value: number | string): string {
  const fee = Number(value);
  return Number.isFinite(fee) ? `$${fee.toFixed(2)}` : "\u2014";
}
