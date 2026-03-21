import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditAction =
  | "phn_accessed"
  | "claim_created"
  | "claim_confirmed"
  | "claim_submitted"
  | "claim_viewed"
  | "fee_code_searched"
  | "login"
  | "otp_requested";

/**
 * Create an audit log entry. Append-only — entries are never updated or deleted.
 */
export async function auditLog(
  userId: string | null,
  action: AuditAction,
  resourceType: string,
  resourceId?: string | null,
  metadata?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  await db.insert(auditLogs).values({
    userId,
    action,
    resourceType,
    resourceId: resourceId ?? null,
    metadata: metadata ?? null,
    ipAddress: ipAddress ?? null,
  });
}
