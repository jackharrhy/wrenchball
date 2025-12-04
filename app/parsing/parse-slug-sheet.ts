import ExcelJS from "exceljs";

export type ChemistryLookup = Map<
  string,
  { chemPlus: string[]; chemMinus: string[] }
>;

export type PlayerStats = {
  character: string;
  characterClass: string;
  captain: boolean;
  throwingArm: string;
  battingStance: string;
  ability: string;
  weight: number;
  hittingTrajectory: string;
  slapHitContactSize: number;
  chargeHitContactSize: number;
  slapHitPower: number;
  chargeHitPower: number;
  bunting: number;
  speed: number;
  throwingSpeed: number;
  fielding: number;
  curveballSpeed: number;
  fastballSpeed: number;
  curve: number;
  stamina: number;
  pitchingCss: number;
  battingCss: number;
  fieldingCss: number;
  speedCss: number;
};

export type SlugSheetData = {
  chemistryLookup: ChemistryLookup;
  playerStats: PlayerStats[];
};

const CHEM_GREEN = "FF00FF00";
const CHEM_YELLOW = "FFFFFF00";
const CHEM_RED = "FFFF0000";
const CHEM_WHITE = "FFFFFFFF";

export async function parseSlugSheet(
  workbookPath: string,
): Promise<SlugSheetData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const chemistryLookup = parseChemistry(workbook);
  const playerStats = parseRelevantStats(workbook);

  return { chemistryLookup, playerStats };
}

export function parseChemistry(workbook: ExcelJS.Workbook): ChemistryLookup {
  const chemistryWorksheet = workbook.getWorksheet("Chemistry");

  if (!chemistryWorksheet) {
    throw new Error("Chemistry worksheet not found");
  }

  const chemistryLookup: ChemistryLookup = new Map();

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

  return chemistryLookup;
}

export function parseRelevantStats(workbook: ExcelJS.Workbook): PlayerStats[] {
  const worksheet = workbook.getWorksheet("Relevant Stats");

  if (!worksheet) {
    throw new Error("Worksheet not found");
  }

  const playerStats: PlayerStats[] = [];

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

    playerStats.push({
      character: character!.toString(),
      characterClass: characterClass!.toString(),
      captain: captain === "Yes",
      throwingArm: throwingArm!.toString(),
      battingStance: battingStance!.toString(),
      ability: ability!.toString(),
      weight: Number(weight),
      hittingTrajectory: hittingTrajectory!.toString(),
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
  }

  return playerStats;
}

export function generateChemistryCss(chemistryLookup: ChemistryLookup): string {
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

  return cssLines.join("\n") + "\n";
}

export type NormalizedChemistryPair = {
  character1: string;
  character2: string;
  relationship: "positive" | "negative";
};

export function normalizeChemistryPairs(
  chemistryLookup: ChemistryLookup,
): NormalizedChemistryPair[] {
  const pairs: NormalizedChemistryPair[] = [];
  const insertedPairKeys = new Set<string>();

  for (const [character, relationships] of chemistryLookup.entries()) {
    for (const otherCharacter of relationships.chemPlus) {
      // Normalize pair: always store with character1 < character2 lexicographically
      const [char1, char2] =
        character < otherCharacter
          ? [character, otherCharacter]
          : [otherCharacter, character];
      const pairKey = `${char1}|${char2}`;
      if (!insertedPairKeys.has(pairKey)) {
        insertedPairKeys.add(pairKey);
        pairs.push({
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
      if (!insertedPairKeys.has(pairKey)) {
        insertedPairKeys.add(pairKey);
        pairs.push({
          character1: char1,
          character2: char2,
          relationship: "negative",
        });
      }
    }
  }

  return pairs;
}
