import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../database/schema";
import path from "node:path";
import fs from "node:fs/promises";
import {
  parseSlugSheet,
  generateChemistryCss,
  normalizeChemistryPairs,
} from "../app/parsing/parse-slug-sheet";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const workbookPath = path.join(process.cwd(), "data", "lil sLUg Crew S3.xlsx");
console.log(`Reading chemistry data from: ${workbookPath}`);

const { chemistryLookup } = await parseSlugSheet(workbookPath);
const chemistryPairs = normalizeChemistryPairs(chemistryLookup);

console.log(`Found ${chemistryPairs.length} chemistry pairs`);

const chemCssPath = path.join(process.cwd(), "app", "chem.css");
const chemCssContent = generateChemistryCss(chemistryLookup);
await fs.writeFile(chemCssPath, chemCssContent, "utf8");
console.log(
  `Generated ${chemCssContent.split("\n").length - 1} chemistry CSS rules in ${chemCssPath}`,
);

await db.transaction(async (tx) => {
  const existingPairs = await tx.select().from(schema.chemistry);
  const existingPairKeys = new Set(
    existingPairs.map((p) => `${p.character1}|${p.character2}`),
  );

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  const newPairKeys = new Set<string>();

  for (const pair of chemistryPairs) {
    const pairKey = `${pair.character1}|${pair.character2}`;
    newPairKeys.add(pairKey);

    if (existingPairKeys.has(pairKey)) {
      await tx
        .update(schema.chemistry)
        .set({ relationship: pair.relationship })
        .where(
          sql`${schema.chemistry.character1} = ${pair.character1} AND ${schema.chemistry.character2} = ${pair.character2}`,
        );
      updated++;
    } else {
      await tx.insert(schema.chemistry).values({
        character1: pair.character1,
        character2: pair.character2,
        relationship: pair.relationship,
      });
      inserted++;
    }
  }

  for (const existingPair of existingPairs) {
    const pairKey = `${existingPair.character1}|${existingPair.character2}`;
    if (!newPairKeys.has(pairKey)) {
      await tx
        .delete(schema.chemistry)
        .where(
          sql`${schema.chemistry.character1} = ${existingPair.character1} AND ${schema.chemistry.character2} = ${existingPair.character2}`,
        );
      deleted++;
    }
  }

  console.log(
    `Chemistry update complete: ${inserted} inserted, ${updated} updated, ${deleted} deleted`,
  );
});

await client.end();
console.log("Done!");
