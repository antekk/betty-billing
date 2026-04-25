import { and, desc, eq, gte, lte } from "drizzle-orm";

import type { ClaimStatus } from "@betty/shared";

import { db } from "@/db";
import { claims } from "@/db/schema";

export interface ClaimSummary {
  id: string;
  status: ClaimStatus;
  feeCode: string;
  modifier: string | null;
  diagnosticCode: string | null;
  phnLast4: string;
  patientName: string | null;
  serviceDate: string;
  expectedFee: string;
  rejectionReason: string | null;
  submittedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Fetch a single claim owned by the user. Never returns the encrypted PHN — only last4.
 */
export async function getClaimForUser(
  claimId: string,
  userId: string
): Promise<ClaimSummary | null> {
  const [row] = await db
    .select({
      id: claims.id,
      status: claims.status,
      feeCode: claims.feeCode,
      modifier: claims.modifier,
      diagnosticCode: claims.diagnosticCode,
      phnLast4: claims.phnLast4,
      patientName: claims.patientName,
      serviceDate: claims.serviceDate,
      expectedFee: claims.expectedFee,
      rejectionReason: claims.rejectionReason,
      submittedAt: claims.submittedAt,
      resolvedAt: claims.resolvedAt,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
      userId: claims.userId,
    })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.userId, userId)))
    .limit(1);

  if (!row) return null;
  // Strip userId from the returned shape
  const { userId: _userId, ...rest } = row;
  void _userId;
  return rest;
}

interface ListClaimsOptions {
  status?: ClaimStatus;
  serviceDateFrom?: string; // ISO YYYY-MM-DD
  serviceDateTo?: string;
  phnLast4?: string;
  limit?: number;
}

export async function listClaimsForUser(
  userId: string,
  opts: ListClaimsOptions = {}
): Promise<ClaimSummary[]> {
  const filters = [eq(claims.userId, userId)];
  if (opts.status) filters.push(eq(claims.status, opts.status));
  if (opts.serviceDateFrom) filters.push(gte(claims.serviceDate, opts.serviceDateFrom));
  if (opts.serviceDateTo) filters.push(lte(claims.serviceDate, opts.serviceDateTo));
  if (opts.phnLast4) filters.push(eq(claims.phnLast4, opts.phnLast4));

  const rows = await db
    .select({
      id: claims.id,
      status: claims.status,
      feeCode: claims.feeCode,
      modifier: claims.modifier,
      diagnosticCode: claims.diagnosticCode,
      phnLast4: claims.phnLast4,
      patientName: claims.patientName,
      serviceDate: claims.serviceDate,
      expectedFee: claims.expectedFee,
      rejectionReason: claims.rejectionReason,
      submittedAt: claims.submittedAt,
      resolvedAt: claims.resolvedAt,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
    })
    .from(claims)
    .where(and(...filters))
    .orderBy(desc(claims.serviceDate))
    .limit(Math.min(opts.limit ?? 25, 100));

  return rows;
}
