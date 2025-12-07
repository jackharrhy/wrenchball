import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../database/schema";
import path from "node:path";
import fs from "node:fs/promises";
import {
  parseSlugSheet,
  generateChemistryCss,
  normalizeChemistryPairs,
} from "../app/parsing/parse-slug-sheet";
import { parseUsersCsv } from "../app/parsing/parse-users";
import { parseMiiMetadataCsv } from "../app/parsing/parse-miis";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const usersCsvPath = path.join(process.cwd(), "data", "users.csv");
const usersCsvContent = await fs.readFile(usersCsvPath, "utf8");
const users = parseUsersCsv(usersCsvContent);

const miiCsvPath = path.join(process.cwd(), "data", "mii_metadata.csv");
const miiCsvContent = await fs.readFile(miiCsvPath, "utf8");
const miis = parseMiiMetadataCsv(miiCsvContent);

const workbookPath = path.join(process.cwd(), "data", "lil sLUg Crew S3.xlsx");
const { chemistryLookup, playerStats } = await parseSlugSheet(workbookPath);

const chemCssPath = path.join(process.cwd(), "app", "chem.css");
const chemCssContent = generateChemistryCss(chemistryLookup);
await fs.writeFile(chemCssPath, chemCssContent, "utf8");
console.log(
  `Generated ${chemCssContent.split("\n").length - 1} chemistry CSS rules in ${chemCssPath}`,
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
        discordSnowflake: user.discordSnowflake,
      })
      .returning();

    const teamName = `${user.name}'s Team`;
    await tx.insert(schema.teams).values({
      name: teamName,
      userId: dbUser.id,
      abbreviation: user.initial,
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

  for (const stat of playerStats) {
    console.log(`Inserting stats for ${stat.character}`);

    await tx.insert(schema.stats).values({
      character: stat.character,
      characterClass: stat.characterClass,
      captain: stat.captain,
      throwingArm: stat.throwingArm as any,
      battingStance: stat.battingStance as any,
      ability: stat.ability as any,
      weight: stat.weight,
      hittingTrajectory: stat.hittingTrajectory as any,
      slapHitContactSize: stat.slapHitContactSize,
      chargeHitContactSize: stat.chargeHitContactSize,
      slapHitPower: stat.slapHitPower,
      chargeHitPower: stat.chargeHitPower,
      bunting: stat.bunting,
      speed: stat.speed,
      throwingSpeed: stat.throwingSpeed,
      fielding: stat.fielding,
      curveballSpeed: stat.curveballSpeed,
      fastballSpeed: stat.fastballSpeed,
      curve: stat.curve,
      stamina: stat.stamina,
      pitchingCss: stat.pitchingCss,
      battingCss: stat.battingCss,
      fieldingCss: stat.fieldingCss,
      speedCss: stat.speedCss,
    });

    if (!stat.character.includes("Mii")) {
      console.log(`Inserting player ${stat.character}`);
      let imageUrl: string | null = null;
      const characterImageName = stat.character.toLowerCase().replace(".", "");
      const colorMatch = characterImageName.match(/^(.*)\s+\(([^)]+)\)$/);
      let baseCharacterImageName = characterImageName;
      if (colorMatch) {
        const base = colorMatch[1].trim();
        const color = colorMatch[2].trim();
        baseCharacterImageName = `${color} ${base}`
          .toLowerCase()
          .replace(".", "")
          .replace(/\s+/g, " ");
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
          `Image not found for ${stat.character} (${rightSideviewPath})`,
        );
      }
      await tx.insert(schema.players).values({
        name: stat.character,
        imageUrl,
        statsCharacter: stat.character,
        sortPosition,
      });
      sortPosition++;
    }
  }

  // Insert chemistry relationships
  console.log("Inserting chemistry relationships");
  const chemistryPairs = normalizeChemistryPairs(chemistryLookup);
  for (const pair of chemistryPairs) {
    await tx.insert(schema.chemistry).values({
      character1: pair.character1,
      character2: pair.character2,
      relationship: pair.relationship,
    });
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

  // Insert match locations
  console.log("Inserting match locations");
  const matchLocationNames = [
    "Mario Stadium (Day)",
    "Mario Stadium (Night)",
    "Yoshi Park (Day)",
    "Yoshi Park (Night)",
    "Wario City (Day)",
    "Wario City (Night)",
    "DK Jungle (Day)",
    "DK Jungle (Night)",
    "Daisy Cruiser (Day)",
    "Daisy Cruiser (Night)",
    "Bowser Jr's Playroom",
    "Bowser's Castle",
  ];

  for (const locationName of matchLocationNames) {
    await tx.insert(schema.matchLocations).values({
      name: locationName,
    });
  }

  console.log("Data inserted successfully");
});

await client.end();
