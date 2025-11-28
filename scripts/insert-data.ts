import ExcelJS from "exceljs";
import Papa from "papaparse";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../database/schema";
import path from "node:path";
import fs from "node:fs/promises";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const usersCsvPath = path.join(process.cwd(), "data", "users.csv");
const usersCsvContent = await fs.readFile(usersCsvPath, "utf8");

const usersCsv = await Papa.parse(usersCsvContent, {
  header: true,
  skipEmptyLines: true,
});

type User = {
  name: string;
  initial: string;
  discord_snowflake: string;
  role: string;
};

const users = [] as User[];

for (const row of usersCsv.data as any[]) {
  users.push({
    name: row.name,
    initial: row.initial,
    discord_snowflake: row.discord_snowflake,
    role: row.role,
  });
}

const miiCsvPath = path.join(process.cwd(), "data", "mii_metadata.csv");
const miiCsvContent = await fs.readFile(miiCsvPath, "utf8");

const miiCsv = await Papa.parse(miiCsvContent, {
  header: true,
  skipEmptyLines: true,
});

type Mii = {
  name: string;
  character: string;
};

const miis = [] as Mii[];

for (const row of miiCsv.data as any[]) {
  let favoriteColor = row.favorite_color;
  if (favoriteColor === "DarkGreen") {
    favoriteColor = "Green";
  } else if (favoriteColor === "Green") {
    favoriteColor = "Light Green";
  }
  favoriteColor = favoriteColor.replace(/([a-z])([A-Z])/g, "$1 $2");
  const gender = row.gender;
  const character = `${favoriteColor} Mii${gender === "Female" ? " (F)" : ""}`;
  miis.push({
    name: row.mii_name,
    character,
  });
}

const workbookPath = path.join(process.cwd(), "data", "lil sLUg Crew S3.xlsx");

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(workbookPath);

const worksheet = workbook.getWorksheet("Relevant Stats");

if (!worksheet) {
  throw new Error("Worksheet not found");
}

const chemistryWorksheet = workbook.getWorksheet("Chemistry");

if (!chemistryWorksheet) {
  throw new Error("Chemistry worksheet not found");
}

type ChemistryLookup = Map<string, { chemPlus: string[]; chemMinus: string[] }>;

const chemistryLookup: ChemistryLookup = new Map();

const CHEM_GREEN = "FF00FF00";
const CHEM_YELLOW = "FFFFFF00";
const CHEM_RED = "FFFF0000";
const CHEM_WHITE = "FFFFFFFF";

const headerRow = chemistryWorksheet.getRow(1);
const columnCharacterNames: (string | null)[] = [];
headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
  if (colNumber >= 3) {
    const value = cell.value;
    columnCharacterNames[colNumber] =
      value && typeof value === "string" ? value.trim() : null;
  }
});

const rowCharacterNames: Map<number, string> = new Map();
for (let rowNum = 3; rowNum <= chemistryWorksheet.rowCount; rowNum++) {
  const columnIndex = rowNum;
  const characterName = columnCharacterNames[columnIndex];

  if (characterName) {
    rowCharacterNames.set(rowNum, characterName);
    chemistryLookup.set(characterName, { chemPlus: [], chemMinus: [] });
  }
}

for (let rowNum = 3; rowNum <= chemistryWorksheet.rowCount; rowNum++) {
  const rowCharacterName = rowCharacterNames.get(rowNum);
  if (!rowCharacterName) {
    continue;
  }

  const row = chemistryWorksheet.getRow(rowNum);
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber < 3) return;

    const columnCharacterName = columnCharacterNames[colNumber];
    if (!columnCharacterName) return;

    if (rowCharacterName === columnCharacterName) return;

    const fill = cell.fill;
    if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") {
      return;
    }

    const bgColor = fill.bgColor;
    if (!bgColor || !bgColor.argb) {
      return;
    }

    const argb = bgColor.argb.toUpperCase();
    const cellAddress = cell.address;

    if (argb === CHEM_WHITE) {
      return;
    }

    if (argb === CHEM_GREEN || argb === CHEM_YELLOW) {
      const entry = chemistryLookup.get(rowCharacterName);
      if (entry && !entry.chemPlus.includes(columnCharacterName)) {
        entry.chemPlus.push(columnCharacterName);
      }
    } else if (argb === CHEM_RED) {
      const entry = chemistryLookup.get(rowCharacterName);
      if (entry && !entry.chemMinus.includes(columnCharacterName)) {
        entry.chemMinus.push(columnCharacterName);
      }
    } else {
      throw new Error(
        `Unknown chemistry color ARGB value "${argb}" at cell ${cellAddress} ` +
          `(Row: ${rowCharacterName}, Column: ${columnCharacterName}). ` +
          `Please add this ARGB value to the known colors.`,
      );
    }
  });
}

// Generate chem.css file
const chemCssPath = path.join(process.cwd(), "app", "chem.css");
const cssLines: string[] = [];

// Generate CSS for positive chemistry (opacity: 1)
for (const [character, relationships] of chemistryLookup.entries()) {
  for (const otherCharacter of relationships.chemPlus) {
    cssLines.push(
      `[data-player="${character}"] [data-player="${otherCharacter}"] span {opacity: 1;}`,
    );
  }
}

// Generate CSS for negative chemistry (red filter)
for (const [character, relationships] of chemistryLookup.entries()) {
  for (const otherCharacter of relationships.chemMinus) {
    cssLines.push(
      `[data-player="${character}"] [data-player="${otherCharacter}"] span {filter: brightness(0.7) saturate(3) sepia(0.3) hue-rotate(-10deg);}`,
    );
  }
}

// Sort CSS lines for consistent output
cssLines.sort();

// Write the CSS file
await fs.writeFile(chemCssPath, cssLines.join("\n") + "\n", "utf8");
console.log(
  `Generated ${cssLines.length} chemistry CSS rules in ${chemCssPath}`,
);

const imageDir = path.join(process.cwd(), "public", "images");

const draftOrderLookup = {
  Noran: 1,
  Evan: 2,
  Ethan: 3,
  Luke: 4,
  NDA: 5,
  Jack: 6,
  ADwy: 7,
  Roomba: 8,
  Michael: 9,
  Luther: 10,
};

await db.transaction(async (tx) => {
  const [season] = await tx
    .insert(schema.season)
    .values({
      state: "pre-season",
    })
    .returning();

  for (const user of users) {
    console.log(`Inserting user ${user.name}`);
    const [dbUser] = await tx
      .insert(schema.users)
      .values({
        name: user.name,
        role: user.role as any,
        discordSnowflake: user.discord_snowflake,
      })
      .returning();

    const teamName = `${user.name}'s Team`;
    const abbreviation =
      user.name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3) || user.name.slice(0, 3).toUpperCase();
    await tx.insert(schema.teams).values({
      name: teamName,
      userId: dbUser.id,
      abbreviation,
      color: "white",
    });

    const draftingTurn = draftOrderLookup[user.name];

    if (!draftingTurn) {
      throw new Error(`Drafting turn not found for ${user.name}`);
    }

    await tx.insert(schema.usersSeasons).values({
      userId: dbUser.id,
      seasonId: season.id,
      draftingTurn,
    });
  }

  let sortPosition = 1;

  for (let i = 4; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);

    if (row === undefined) {
      throw new Error(`Row ${i} is undefined`);
    }

    const values = row.values;

    if (!Array.isArray(values)) {
      throw new Error(`Row ${i} values is not an array`);
    }

    const [
      ,
      character,
      characterClass,
      captain,
      throwingArm,
      battingStance,
      ability,
      weight,
      hittingTrajectory,
      slapHitContactSize,
      chargeHitContactSize,
      slapHitPower,
      chargeHitPower,
      bunting,
      speed,
      throwingSpeed,
      fielding,
      curveballSpeed,
      fastballSpeed,
      curve,
      stamina,
      pitchingCss,
      battingCss,
      fieldingCss,
      speedCss,
    ] = values;
    console.log(`Inserting stats for ${character!.toString()}`);

    await tx.insert(schema.stats).values({
      character: character!.toString(),
      characterClass: characterClass!.toString(),
      captain: captain === "Yes",
      throwingArm: throwingArm!.toString() as any,
      battingStance: battingStance!.toString() as any,
      ability: ability!.toString() as any,
      weight: Number(weight),
      hittingTrajectory: hittingTrajectory!.toString() as any,
      slapHitContactSize: Number(slapHitContactSize),
      chargeHitContactSize: Number(chargeHitContactSize),
      slapHitPower: Number(slapHitPower),
      chargeHitPower: Number(chargeHitPower),
      bunting: Number(bunting),
      speed: Number(speed),
      throwingSpeed: Number(throwingSpeed),
      fielding: Number(fielding),
      curveballSpeed: Number(curveballSpeed),
      fastballSpeed: Number(fastballSpeed),
      curve: Number(curve),
      stamina: Number(stamina!.toString().replace(",", "")),
      pitchingCss: Number(pitchingCss),
      battingCss: Number(battingCss),
      fieldingCss: Number(fieldingCss),
      speedCss: Number(speedCss),
    });

    if (!character!.toString().includes("Mii")) {
      console.log(`Inserting player ${character!.toString()}`);
      let imageUrl: string | null = null;
      const characterImageName = character!
        .toString()
        .toLowerCase()
        .replace(".", "");
      const colorMatch = characterImageName.match(/^(.*)\s+\(([^)]+)\)$/);
      let displayCharacterName = character!.toString();
      let baseCharacterImageName = characterImageName;
      if (colorMatch) {
        const base = colorMatch[1].trim();
        const color = colorMatch[2].trim();
        baseCharacterImageName = `${color} ${base}`
          .toLowerCase()
          .replace(".", "")
          .replace(/\s+/g, " ");
        displayCharacterName = `${color} ${base}`;
      }
      const rightSideviewPath = path.join(
        imageDir,
        "players",
        "sideview",
        "right",
        `${baseCharacterImageName}.png`,
      );
      if (
        await fs
          .access(rightSideviewPath)
          .then(() => true)
          .catch(() => false)
      ) {
        imageUrl = `/images/players/sideview/right/${baseCharacterImageName}.png`;
      } else {
        throw new Error(
          `Image not found for ${character!.toString()} (${rightSideviewPath})`,
        );
      }
      await tx.insert(schema.players).values({
        name: character!.toString(),
        imageUrl,
        statsCharacter: character!.toString(),
        sortPosition,
      });
      sortPosition++;
    }
  }

  // Insert chemistry relationships
  console.log("Inserting chemistry relationships");
  const insertedChemistryPairs = new Set<string>();
  for (const [character, relationships] of chemistryLookup.entries()) {
    for (const otherCharacter of relationships.chemPlus) {
      // Normalize pair: always store with character1 < character2 lexicographically
      const [char1, char2] =
        character < otherCharacter
          ? [character, otherCharacter]
          : [otherCharacter, character];
      const pairKey = `${char1}|${char2}`;
      if (!insertedChemistryPairs.has(pairKey)) {
        insertedChemistryPairs.add(pairKey);
        await tx.insert(schema.chemistry).values({
          character1: char1,
          character2: char2,
          relationship: "positive",
        });
      }
    }
    for (const otherCharacter of relationships.chemMinus) {
      // Normalize pair: always store with character1 < character2 lexicographically
      const [char1, char2] =
        character < otherCharacter
          ? [character, otherCharacter]
          : [otherCharacter, character];
      const pairKey = `${char1}|${char2}`;
      if (!insertedChemistryPairs.has(pairKey)) {
        insertedChemistryPairs.add(pairKey);
        await tx.insert(schema.chemistry).values({
          character1: char1,
          character2: char2,
          relationship: "negative",
        });
      }
    }
  }

  // Sort Miis by character first, then by name
  const sortedMiis = [...miis].sort((a, b) => {
    const characterCompare = a.character.localeCompare(b.character);
    if (characterCompare !== 0) {
      return characterCompare;
    }
    return a.name.localeCompare(b.name);
  });

  for (const mii of sortedMiis) {
    console.log(`Inserting Mii ${mii.name}`);
    let imageUrl: string | null = null;
    const miiImagePath = path.join(imageDir, "miis", `${mii.name}.png`);
    if (
      await fs
        .access(miiImagePath)
        .then(() => true)
        .catch(() => false)
    ) {
      imageUrl = `/images/miis/${mii.name}.png`;
    } else {
      throw new Error(`Image not found for ${mii.name} (${miiImagePath})`);
    }
    await tx.insert(schema.players).values({
      name: mii.name,
      imageUrl,
      statsCharacter: mii.character,
      sortPosition,
    });
    sortPosition++;
  }

  console.log("Data inserted successfully");
});

await client.end();
