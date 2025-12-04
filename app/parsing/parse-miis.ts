import Papa from "papaparse";

export type Mii = {
  name: string;
  character: string;
};

export function parseMiiMetadataCsv(csvContent: string): Mii[] {
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const miis: Mii[] = [];

  for (const row of parsed.data as any[]) {
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

  return miis;
}
