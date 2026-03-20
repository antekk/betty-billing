import { pgTable, uuid, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const batchStatusEnum = pgEnum("batch_status", [
  "pending",
  "submitted",
  "completed",
  "partial_failure",
]);

export const batchSubmissions = pgTable("batch_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: batchStatusEnum("status").notNull().default("pending"),
  claimIds: uuid("claim_ids").array().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  responseData: jsonb("response_data"),
});
