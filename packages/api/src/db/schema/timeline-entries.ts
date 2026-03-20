import { pgTable, uuid, text, jsonb, boolean, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";

export const timelineEntryTypeEnum = pgEnum("timeline_entry_type", [
  "message",
  "widget",
  "system_event",
]);

export const directionEnum = pgEnum("direction", ["inbound", "outbound", "system"]);

export const visibilityEnum = pgEnum("visibility", ["default", "filtered", "internal"]);

export const widgetTypeEnum = pgEnum("widget_type", [
  "claim_confirmation",
  "action_card",
  "report",
]);

export const timelineEntries = pgTable(
  "timeline_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: timelineEntryTypeEnum("type").notNull(),
    direction: directionEnum("direction").notNull(),
    content: text("content"),
    widgetType: widgetTypeEnum("widget_type"),
    widgetData: jsonb("widget_data"),
    visibility: visibilityEnum("visibility").notNull().default("default"),
    importanceFlag: boolean("importance_flag").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("timeline_user_created_idx").on(table.userId, table.createdAt)]
);
