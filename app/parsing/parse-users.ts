import Papa from "papaparse";

export type User = {
  name: string;
  initial: string;
  discordSnowflake: string;
  role: string;
};

export function parseUsersCsv(csvContent: string): User[] {
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const users: User[] = [];

  for (const row of parsed.data as any[]) {
    users.push({
      name: row.name,
      initial: row.initial,
      discordSnowflake: row.discord_snowflake,
      role: row.role,
    });
  }

  return users;
}
