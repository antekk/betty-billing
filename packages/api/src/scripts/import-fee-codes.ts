#!/usr/bin/env bun
/**
 * Import AHCIP Schedule of Medical Benefits (SOMB) data into the database.
 *
 * Usage:
 *   bun run packages/api/src/scripts/import-fee-codes.ts [somb-directory]
 *
 * Default directory: docs/support/AB-somb
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { feeCodes } from "../db/schema/fee-codes";
import {
  parseHealthServiceCodes,
  getCurrentCodes,
} from "./parsers/health-service-codes";
import { parsePriceList, getCurrentPrices } from "./parsers/price-list";
import { parseModifiers, getCurrentModifiers } from "./parsers/modifiers";

const sombDir = process.argv[2] || resolve(process.cwd(), "docs/support/AB-somb");

function readFile(filename: string): string {
  const path = resolve(sombDir, filename);
  console.log(`Reading ${path}...`);
  return readFileSync(path, "utf-8");
}

async function main() {
  console.log(`\nImporting SOMB data from: ${sombDir}\n`);

  // Parse all source files
  const hsContent = readFile("ehsmedbc.txt");
  const pcContent = readFile("epcmedbc.txt");
  const modContent = readFile("efeemodr.txt");

  const allCodes = parseHealthServiceCodes(hsContent);
  console.log(`Parsed ${allCodes.length} total health service code records`);

  const currentCodes = getCurrentCodes(allCodes);
  console.log(`Found ${currentCodes.length} currently active codes`);

  const { prices } = parsePriceList(pcContent);
  console.log(`Parsed ${prices.length} price records`);

  const currentPrices = getCurrentPrices(prices);
  console.log(`Found ${currentPrices.size} current prices`);

  const allModifiers = parseModifiers(modContent);
  const currentMods = getCurrentModifiers(allModifiers);
  console.log(`Found ${currentMods.length} current modifiers`);

  // Build modifier lookup
  const modifierMap = new Map<string, { code: string; description: string; type: string }[]>();
  for (const mod of currentMods) {
    // Modifiers are global — not per fee code. Store them all.
    if (!modifierMap.has(mod.code)) {
      modifierMap.set(mod.code, []);
    }
    modifierMap.get(mod.code)!.push({
      code: mod.code,
      description: mod.description,
      type: mod.type,
    });
  }

  // Merge descriptions + prices into fee code records
  const feeCodeRecords = currentCodes.map((hsc) => {
    const price = currentPrices.get(hsc.code);
    const baseFee = price ? (price.baseFee / 100).toFixed(2) : "0.00";

    // Build full description including qualifier
    let description = hsc.description;
    if (hsc.qualifier) {
      description += ` — ${hsc.qualifier}`;
    }

    // Determine category from the fee code prefix
    const category = categorizeCode(hsc.code);

    return {
      code: hsc.code,
      description,
      baseFee,
      modifiers: null as unknown, // modifiers are global, not per-code in SOMB
      category,
      rulesNotes: null as string | null,
      effectiveDate: hsc.effectiveDate,
      endDate: hsc.endDate,
    };
  });

  console.log(`\nPrepared ${feeCodeRecords.length} fee code records for import`);

  // Database import
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set. Set it in .env or environment.");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("Importing to database...");

  // Batch insert in chunks of 500
  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < feeCodeRecords.length; i += BATCH_SIZE) {
    const batch = feeCodeRecords.slice(i, i + BATCH_SIZE);
    await db.insert(feeCodes).values(batch).onConflictDoUpdate({
      target: [feeCodes.code, feeCodes.effectiveDate],
      set: {
        description: feeCodes.description,
        baseFee: feeCodes.baseFee,
        category: feeCodes.category,
      },
    });
    imported += batch.length;
    process.stdout.write(`\r  Imported ${imported}/${feeCodeRecords.length}`);
  }

  console.log(`\n\nDone! Imported ${imported} fee codes.`);

  // Print some stats
  const categories = new Map<string, number>();
  for (const fc of feeCodeRecords) {
    categories.set(fc.category, (categories.get(fc.category) || 0) + 1);
  }
  console.log("\nBy category:");
  for (const [cat, count] of [...categories.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${cat}: ${count}`);
  }

  await client.end();
}

function categorizeCode(code: string): string {
  // Alberta fee codes are organized by section number
  if (code.startsWith("E") || code.startsWith("e")) return "Laboratory";
  if (code.startsWith("Z") || code.startsWith("z")) return "ZZZZ-Special";

  const section = code.split(".")[0];
  const sectionNum = parseInt(section, 10);

  if (isNaN(sectionNum)) return "Other";

  // Based on Alberta SOMB section numbering
  if (sectionNum >= 1 && sectionNum <= 2) return "Diagnostic Procedures";
  if (sectionNum === 3) return "General Practice / Assessment";
  if (sectionNum >= 4 && sectionNum <= 6) return "General Services";
  if (sectionNum >= 7 && sectionNum <= 9) return "Surgical Services";
  if (sectionNum >= 10 && sectionNum <= 12) return "Surgical Services";
  if (sectionNum >= 13 && sectionNum <= 19) return "Surgical Services";
  if (sectionNum >= 20 && sectionNum <= 29) return "Anesthesia";
  if (sectionNum >= 30 && sectionNum <= 39) return "Radiology";
  if (sectionNum >= 40 && sectionNum <= 49) return "Laboratory Medicine";
  if (sectionNum >= 50 && sectionNum <= 59) return "Physical Medicine";
  if (sectionNum >= 60 && sectionNum <= 69) return "Psychiatry";
  if (sectionNum >= 70 && sectionNum <= 79) return "Reproductive Medicine";
  if (sectionNum >= 80 && sectionNum <= 89) return "Ophthalmology";
  if (sectionNum >= 90 && sectionNum <= 99) return "Miscellaneous";

  return "Other";
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
