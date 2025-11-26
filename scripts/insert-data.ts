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

const imageDir = path.join(process.cwd(), "public", "images");

await db.transaction(async (tx) => {
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
  }

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
      captain: Boolean(captain),
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
        `${baseCharacterImageName}.png`
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
          `Image not found for ${character!.toString()} (${rightSideviewPath})`
        );
      }
      await tx.insert(schema.players).values({
        name: character!.toString(),
        imageUrl,
        statsCharacter: character!.toString(),
      });
    }
  }

  for (const mii of miis) {
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
    });
  }

  console.log("Data inserted successfully");
});

await client.end();
