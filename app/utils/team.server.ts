import type { User } from "~/database/schema";
import { db, type Database } from "~/database/db";
import { TEAM_SIZE } from "~/consts";
import { eq } from "drizzle-orm";
import { teams } from "~/database/schema";

/**
 * Fetches a team with its players and lineup data
 */
export async function getTeamWithPlayers(teamId: string | number) {
  const team = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.id, Number(teamId)),
    with: {
      players: {
        with: {
          lineup: true,
        },
      },
    },
  });

  if (!team) {
    throw new Response("Team not found", { status: 404 });
  }

  return team;
}

/**
 * Fills a players array to TEAM_SIZE by padding with null values
 */
export function fillPlayersToTeamSize<T>(players: T[]): (T | null)[] {
  const filledPlayers: (T | null)[] = [...players];
  while (filledPlayers.length < TEAM_SIZE) {
    filledPlayers.push(null);
  }
  return filledPlayers;
}

/**
 * Checks if a user can edit a team
 */
export function checkCanEdit(user: User | null, teamUserId: number): boolean {
  return user?.id === teamUserId || user?.role === "admin";
}

/**
 * Updates a team's name with validation
 * Returns an object with success status and optional error message
 */
export async function updateTeamName(
  db: Database,
  teamId: string | number,
  name: string | null,
): Promise<{ success: boolean; message?: string }> {
  if (typeof name !== "string" || !name.trim()) {
    return { success: true };
  }

  const trimmedName = name.trim();

  if (trimmedName.length > 29) {
    return {
      success: false,
      message: "Name must be less than 30 characters",
    };
  }

  await db
    .update(teams)
    .set({ name: trimmedName })
    .where(eq(teams.id, Number(teamId)));

  return { success: true };
}
