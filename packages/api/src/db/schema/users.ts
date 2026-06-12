import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["free", "active"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  billingPreferences: jsonb("billing_preferences"),
  ahcipPractitionerId: varchar("ahcip_practitioner_id", { length: 20 }),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("free"),
  // When Betty last nudged this user about a billing gap (proactive engagement)
  lastBillingReminderAt: timestamp("last_billing_reminder_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
