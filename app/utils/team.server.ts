import type { User, FieldingPosition } from "~/database/schema";
import { db, type Database } from "~/database/db";
import { TEAM_SIZE, LINEUP_SIZE } from "~/consts";
import { eq, inArray } from "drizzle-orm";
import { teams, teamLineups, players } from "~/database/schema";

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
      captain: true,
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

/**
 * Updates a team's trade preferences (looking for, willing to trade)
 * Returns an object with success status and optional error message
 */
export async function updateTeamTradePreferences(
  db: Database,
  teamId: string | number,
  lookingFor: string | null,
  willingToTrade: string | null,
): Promise<{ success: boolean; message?: string }> {
  const trimmedLookingFor = lookingFor?.trim() || null;
  const trimmedWillingToTrade = willingToTrade?.trim() || null;

  await db
    .update(teams)
    .set({
      lookingFor: trimmedLookingFor,
      willingToTrade: trimmedWillingToTrade,
      tradeBlockUpdatedAt: new Date(),
    })
    .where(eq(teams.id, Number(teamId)));

  return { success: true };
}

export interface LineupEntry {
  playerId: number;
  fieldingPosition: FieldingPosition | null;
  battingOrder: number | null;
}

/**
 * Updates a team's lineup with validation
 * Returns an object with success status and optional error message
 */
export async function updateTeamLineup(
  db: Database,
  teamId: string | number,
  lineupEntries: LineupEntry[],
  captainId: number | null,
): Promise<{ success: boolean; message?: string }> {
  const teamIdNum = Number(teamId);

  // Get all players on the team
  const teamPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.teamId, teamIdNum));

  const teamPlayerIds = new Set(teamPlayers.map((p) => p.id));

  // Validate all playerIds belong to the team
  for (const entry of lineupEntries) {
    if (!teamPlayerIds.has(entry.playerId)) {
      return {
        success: false,
        message: `Player ${entry.playerId} does not belong to this team`,
      };
    }
  }

  // Validate captain is playing (has a fieldingPosition)
  if (captainId !== null && captainId !== undefined) {
    const captainEntry = lineupEntries.find((e) => e.playerId === captainId);
    if (!captainEntry || captainEntry.fieldingPosition === null) {
      return {
        success: false,
        message: "Captain must be playing in the game (not on bench)",
      };
    }
  }

  // Separate entries into playing (with position) and bench (no position)
  const playingEntries = lineupEntries.filter(
    (e) => e.fieldingPosition !== null,
  );
  const benchEntries = lineupEntries.filter(
    (e) => e.fieldingPosition === null,
  );

  // Validate all 9 fielding positions are filled (no duplicates)
  if (playingEntries.length !== LINEUP_SIZE) {
    return {
      success: false,
      message: `Exactly ${LINEUP_SIZE} players must be assigned to fielding positions`,
    };
  }

  const fieldingPositions = playingEntries.map((e) => e.fieldingPosition);
  const uniquePositions = new Set(fieldingPositions);
  if (uniquePositions.size !== LINEUP_SIZE) {
    return {
      success: false,
      message: "Each fielding position must be assigned to exactly one player",
    };
  }

  // Validate batting order 1-9 is unique (no duplicates, no gaps)
  const battingOrders = playingEntries
    .map((e) => e.battingOrder)
    .filter((order): order is number => order !== null);

  if (battingOrders.length !== LINEUP_SIZE) {
    return {
      success: false,
      message: "All playing players must have a batting order",
    };
  }

  const uniqueBattingOrders = new Set(battingOrders);
  if (uniqueBattingOrders.size !== LINEUP_SIZE) {
    return {
      success: false,
      message: "Each batting order (1-9) must be assigned to exactly one player",
    };
  }

  const battingOrderSet = new Set(battingOrders);
  for (let i = 1; i <= LINEUP_SIZE; i++) {
    if (!battingOrderSet.has(i)) {
      return {
        success: false,
        message: `Batting order must include all numbers from 1 to ${LINEUP_SIZE}`,
      };
    }
  }

  // Validate players on bench don't have batting order
  for (const entry of benchEntries) {
    if (entry.battingOrder !== null) {
      return {
        success: false,
        message: "Players on bench should not have a batting order",
      };
    }
  }

  // All validations passed, update the lineup
  await db.transaction(async (tx) => {
    // Get existing lineup entries to preserve isStarred status
    const teamPlayerIdsArray = Array.from(teamPlayerIds);
    const existingLineups =
      teamPlayerIdsArray.length > 0
        ? await tx
            .select()
            .from(teamLineups)
            .where(inArray(teamLineups.playerId, teamPlayerIdsArray))
        : [];

    const isStarredMap = new Map(
      existingLineups.map((l) => [l.playerId, l.isStarred]),
    );

    // Delete all existing lineup entries for players on this team
    if (teamPlayerIdsArray.length > 0) {
      await tx
        .delete(teamLineups)
        .where(inArray(teamLineups.playerId, teamPlayerIdsArray));
    }

    // Insert new lineup entries, preserving isStarred status
    const entriesToInsert = lineupEntries.map((entry) => ({
      playerId: entry.playerId,
      fieldingPosition: entry.fieldingPosition,
      battingOrder: entry.battingOrder,
      isStarred: isStarredMap.get(entry.playerId) ?? false,
    }));

    if (entriesToInsert.length > 0) {
      await tx.insert(teamLineups).values(entriesToInsert);
    }
  });

  return { success: true };
}
