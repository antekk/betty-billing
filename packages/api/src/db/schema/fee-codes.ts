import {
  pgTable,
  varchar,
  text,
  decimal,
  jsonb,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

export const feeCodes = pgTable(
  "fee_codes",
  {
    code: varchar("code", { length: 20 }).notNull(),
    description: text("description").notNull(),
    baseFee: decimal("base_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    modifiers: jsonb("modifiers"), // applicable modifiers as JSON
    category: varchar("category", { length: 50 }).notNull(),
    rulesNotes: text("rules_notes"),
    effectiveDate: date("effective_date").notNull(),
    endDate: date("end_date").notNull(),
  },
  (table) => [primaryKey({ columns: [table.code, table.effectiveDate] })]
);
