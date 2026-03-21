import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  decimal,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

import { timelineEntries } from "./timeline-entries";
import { users } from "./users";

export const claimStatusEnum = pgEnum("claim_status", [
  "pending_confirmation",
  "staged",
  "submitted",
  "accepted",
  "rejected",
  "needs_attention",
]);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    timelineEntryId: uuid("timeline_entry_id").references(() => timelineEntries.id),
    status: claimStatusEnum("status").notNull().default("pending_confirmation"),
    feeCode: varchar("fee_code", { length: 20 }).notNull(),
    modifier: varchar("modifier", { length: 10 }),
    phn: text("phn").notNull(), // encrypted
    phnLast4: varchar("phn_last4", { length: 4 }).notNull(),
    patientName: varchar("patient_name", { length: 255 }),
    serviceDate: date("service_date").notNull(),
    diagnosticCode: varchar("diagnostic_code", { length: 20 }),
    expectedFee: decimal("expected_fee", { precision: 10, scale: 2 }).notNull(),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("claims_user_status_idx").on(table.userId, table.status)]
);
