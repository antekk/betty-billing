import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * One row per issued refresh token (the token's jti). Rotation marks the old
 * row revoked and links its replacement; presenting a revoked token is treated
 * as theft and revokes every session for the user.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)]
);
