import { eq } from "drizzle-orm";

import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type {
  ClaimUpdateConfirmationData,
  ClaimUpdateChange,
  ClaimUpdatableField,
} from "@betty/shared";

import { db } from "@/db";
import { timelineEntries } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { getClaimForUser } from "@/services/claim.service";
import { getFeeCode } from "@/services/fee-code.service";

// Statuses where amendment is meaningful. Submitted/accepted claims should not
// be edited via this flow — those need a different correction path.
const EDITABLE_STATUSES = new Set([
  "pending_confirmation",
  "staged",
  "rejected",
  "needs_attention",
]);

const FIELD_LABELS: Record<ClaimUpdatableField, string> = {
  fee_code: "Fee code",
  modifier: "Modifier",
  diagnostic_code: "Diagnostic code",
  service_date: "Service date",
  patient_name: "Patient name",
};

export const updateClaimTool: Tool = {
  name: "update_claim",
  description:
    "Propose changes to an existing claim. This generates a confirmation widget showing the diff (before → after) for the physician to approve. Nothing is mutated until they tap Confirm. Use this for fixing rejected claims (e.g., adding a missing diagnostic code) or correcting a staged claim before submission. Only one of fee_code, modifier, diagnostic_code, service_date, or patient_name needs to change — pass only the fields you want to update.",
  input_schema: {
    type: "object" as const,
    properties: {
      claim_id: {
        type: "string",
        description: "The UUID of the claim to update",
      },
      fee_code: {
        type: "string",
        description: "New fee code (omit to leave unchanged)",
      },
      modifier: {
        type: "string",
        description:
          "New modifier code, or empty string to clear (omit to leave unchanged)",
      },
      diagnostic_code: {
        type: "string",
        description:
          "New ICD-9 diagnostic code (AHCIP requires ICD-9), or empty string to clear (omit to leave unchanged)",
      },
      service_date: {
        type: "string",
        description: "New service date in ISO YYYY-MM-DD format (omit to leave unchanged)",
      },
      patient_name: {
        type: "string",
        description: "New patient name, or empty string to clear (omit to leave unchanged)",
      },
      reason: {
        type: "string",
        description:
          "Short reason for the change, e.g., 'AHCIP rejected: missing diagnostic code'. Shown on the confirmation widget so the physician knows why this is being proposed.",
      },
    },
    required: ["claim_id"],
  },
};

function formatServiceDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeOptional(input: string | undefined): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === "") return null;
  return input;
}

export async function handleUpdateClaim(
  input: {
    claim_id: string;
    fee_code?: string;
    modifier?: string;
    diagnostic_code?: string;
    service_date?: string;
    patient_name?: string;
    reason?: string;
  },
  userId: string
): Promise<string> {
  const claim = await getClaimForUser(input.claim_id, userId);
  if (!claim) {
    return JSON.stringify({
      updated: false,
      error: `Claim "${input.claim_id}" not found.`,
    });
  }

  if (!EDITABLE_STATUSES.has(claim.status)) {
    return JSON.stringify({
      updated: false,
      error: `This claim is in status "${claim.status}" and can't be amended through this flow.`,
    });
  }

  // Resolve proposed values
  const proposed = {
    feeCode: input.fee_code ?? claim.feeCode,
    modifier:
      normalizeOptional(input.modifier) === undefined ? claim.modifier : normalizeOptional(input.modifier)!,
    diagnosticCode:
      normalizeOptional(input.diagnostic_code) === undefined
        ? claim.diagnosticCode
        : normalizeOptional(input.diagnostic_code)!,
    serviceDate: input.service_date ?? claim.serviceDate,
    patientName:
      normalizeOptional(input.patient_name) === undefined
        ? claim.patientName
        : normalizeOptional(input.patient_name)!,
  };

  // Validate proposed fee code if changed
  let proposedFeeCodeDescription: string;
  if (proposed.feeCode !== claim.feeCode) {
    const fc = await getFeeCode(proposed.feeCode);
    if (!fc) {
      return JSON.stringify({
        updated: false,
        error: `Fee code "${proposed.feeCode}" not found in the current schedule.`,
      });
    }
    proposedFeeCodeDescription = fc.description;
  } else {
    const fc = await getFeeCode(claim.feeCode);
    proposedFeeCodeDescription = fc?.description ?? "";
  }

  // Validate service date if changed
  if (input.service_date !== undefined) {
    const d = new Date(proposed.serviceDate);
    if (isNaN(d.getTime())) {
      return JSON.stringify({
        updated: false,
        error: `Invalid service date: "${proposed.serviceDate}"`,
      });
    }
  }

  // Compute diff
  const changes: ClaimUpdateChange[] = [];
  const push = (
    field: ClaimUpdatableField,
    before: string | null,
    after: string | null
  ) => {
    if ((before ?? null) !== (after ?? null)) {
      changes.push({ field, label: FIELD_LABELS[field], before, after });
    }
  };
  push("fee_code", claim.feeCode, proposed.feeCode);
  push("modifier", claim.modifier, proposed.modifier);
  push("diagnostic_code", claim.diagnosticCode, proposed.diagnosticCode);
  push("service_date", claim.serviceDate, proposed.serviceDate);
  push("patient_name", claim.patientName, proposed.patientName);

  if (changes.length === 0) {
    return JSON.stringify({
      updated: false,
      message: "Nothing to change — the proposed values match the current claim.",
    });
  }

  const widgetData: ClaimUpdateConfirmationData = {
    type: "claim_update_confirmation",
    claimId: claim.id,
    changes,
    current: {
      feeCode: proposed.feeCode,
      feeCodeDescription: proposedFeeCodeDescription,
      modifier: proposed.modifier,
      diagnosticCode: proposed.diagnosticCode,
      serviceDate: proposed.serviceDate,
      serviceDateFormatted: formatServiceDate(proposed.serviceDate),
      patientName: proposed.patientName,
      phnLast4: claim.phnLast4,
      expectedFee: claim.expectedFee,
    },
    reason: input.reason ?? null,
    status: claim.status,
  };

  const [entry] = await db
    .insert(timelineEntries)
    .values({
      userId,
      type: "widget",
      direction: "outbound",
      content: null,
      widgetType: "claim_update_confirmation",
      widgetData,
      visibility: "default",
      importanceFlag: false,
    })
    .returning({ id: timelineEntries.id });

  await auditLog(userId, "claim_update_proposed", "claim", claim.id, {
    changes: changes.map((c) => ({ field: c.field, before: c.before, after: c.after })),
    reason: input.reason ?? null,
  });

  return JSON.stringify({
    updated: false, // not applied until physician confirms
    proposed: true,
    claimId: claim.id,
    timelineEntryId: entry.id,
    widget: widgetData,
  });
}
