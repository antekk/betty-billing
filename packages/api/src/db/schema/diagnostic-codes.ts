import {
  pgTable,
  varchar,
  text,
  boolean,
  date,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const codeSystemEnum = pgEnum("diagnostic_code_system", ["icd9", "icd10"]);

export const diagnosticCodes = pgTable(
  "diagnostic_codes",
  {
    code: varchar("code", { length: 20 }).notNull(),
    codeSystem: codeSystemEnum("code_system").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    category: varchar("category", { length: 100 }),
    effectiveDate: date("effective_date").notNull(),
    endDate: date("end_date"),
  },
  (table) => [
    primaryKey({ columns: [table.code, table.codeSystem] }),
    index("diagnostic_codes_enabled_idx").on(table.codeSystem, table.enabled),
  ]
);
