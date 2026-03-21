import { validatePhn } from "@betty/shared";
import { eq } from "drizzle-orm";

import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { ClaimConfirmationData } from "@betty/shared";

import { db } from "@/db";
import { claims, timelineEntries } from "@/db/schema";
import { auditLog } from "@/lib/audit";
import { encrypt } from "@/lib/encryption";
import { getFeeCode } from "@/services/fee-code.service";

export const createClaimTool: Tool = {
  name: "create_claim",
  description:
    "Create a billing claim for submission to AHCIP. This creates the claim in pending_confirmation status and generates a confirmation widget for the physician to review and approve. Only call this after validating all inputs (PHN, fee code, date).",
  input_schema: {
    type: "object" as const,
    properties: {
      fee_code: {
        type: "string",
        description: "The Alberta fee code (e.g., '03.01AA')",
      },
      phn: {
        type: "string",
        description: "The patient's Personal Health Number (9 digits)",
      },
      patient_name: {
        type: "string",
        description: "The patient's name (optional)",
      },
      service_date: {
        type: "string",
        description: "The date of service in ISO format (YYYY-MM-DD)",
      },
      modifier: {
        type: "string",
        description: "Fee modifier code if applicable (e.g., 'ANE', 'ADD')",
      },
      diagnostic_code: {
        type: "string",
        description: "ICD diagnostic code if applicable",
      },
    },
    required: ["fee_code", "phn", "service_date"],
  },
};

export async function handleCreateClaim(
  input: {
    fee_code: string;
    phn: string;
    patient_name?: string;
    service_date: string;
    modifier?: string;
    diagnostic_code?: string;
  },
  userId: string
): Promise<string> {
  // Validate PHN
  const phnResult = validatePhn(input.phn);
  if (!phnResult.valid) {
    return JSON.stringify({
      created: false,
      error: `Invalid PHN: ${phnResult.error}`,
    });
  }

  // Look up fee code
  const feeCode = await getFeeCode(input.fee_code);
  if (!feeCode) {
    return JSON.stringify({
      created: false,
      error: `Fee code "${input.fee_code}" not found in the current schedule.`,
    });
  }

  // Validate service date
  const serviceDate = new Date(input.service_date);
  if (isNaN(serviceDate.getTime())) {
    return JSON.stringify({
      created: false,
      error: `Invalid service date: "${input.service_date}"`,
    });
  }

  // Format service date for display
  const formattedDate = serviceDate.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const expectedFee = feeCode.baseFee;
  const encryptedPhn = encrypt(phnResult.formatted ?? "");
  const phnLast4 = phnResult.last4 ?? "";

  // Create timeline entry with claim confirmation widget
  const widgetData: ClaimConfirmationData = {
    type: "claim_confirmation",
    claimId: "", // will be set after claim insert
    patientName: input.patient_name ?? null,
    phnLast4,
    feeCode: input.fee_code,
    feeCodeDescription: feeCode.description,
    modifier: input.modifier ?? null,
    serviceDate: input.service_date,
    serviceDateFormatted: formattedDate,
    expectedFee,
    status: "pending_confirmation",
  };

  // Insert timeline entry
  const [entry] = await db
    .insert(timelineEntries)
    .values({
      userId,
      type: "widget",
      direction: "outbound",
      content: null,
      widgetType: "claim_confirmation",
      widgetData,
      visibility: "default",
      importanceFlag: false,
    })
    .returning({ id: timelineEntries.id });

  // Insert claim
  const [claim] = await db
    .insert(claims)
    .values({
      userId,
      timelineEntryId: entry.id,
      status: "pending_confirmation",
      feeCode: input.fee_code,
      modifier: input.modifier ?? null,
      phn: encryptedPhn,
      phnLast4,
      patientName: input.patient_name ?? null,
      serviceDate: input.service_date,
      diagnosticCode: input.diagnostic_code ?? null,
      expectedFee,
    })
    .returning({ id: claims.id });

  // Update widget data with claim ID
  widgetData.claimId = claim.id;
  await db.update(timelineEntries).set({ widgetData }).where(eq(timelineEntries.id, entry.id));

  // Audit log
  await auditLog(userId, "claim_created", "claim", claim.id, {
    feeCode: input.fee_code,
    phnLast4,
    serviceDate: input.service_date,
  });

  return JSON.stringify({
    created: true,
    claimId: claim.id,
    timelineEntryId: entry.id,
    widget: widgetData,
  });
}
