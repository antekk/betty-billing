import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * Web Push subscriptions. A user can have several (one per browser/device).
 * Endpoint is unique — re-subscribing the same browser upserts.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)]
);
