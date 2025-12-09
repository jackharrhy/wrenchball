import { eq, asc, and, count, desc, max, gt } from "drizzle-orm";
import { type Database } from "~/database/db";
import {
  matches,
  matchBattingOrders,
  matchPlayerStats,
  matchLocations,
  teamLineups,
  players,
  teams,
  type MatchState,
  type MatchPlayerStats,
} from "~/database/schema";
import { LINEUP_SIZE } from "~/consts";
import { createMatchStateChangeEvent } from "~/utils/events.server";

export interface CreateMatchParams {
  teamAId: number;
  teamBId: number;
  matchDayId: number;
  scheduledDate?: Date | null;
  locationId?: number | null;
}

export const createMatch = async (
  db: Database,
  {
    teamAId,
    teamBId,
    matchDayId,
    scheduledDate,
    locationId,
  }: CreateMatchParams,
) => {
  if (teamAId === teamBId) {
    throw new Error("Team A and Team B must be different teams");
  }

  const [teamACount] = await db
    .select({ count: count() })
    .from(players)
    .where(eq(players.teamId, teamAId));

  const [teamBCount] = await db
    .select({ count: count() })
    .from(players)
    .where(eq(players.teamId, teamBId));

  if (teamACount.count < LINEUP_SIZE) {
    const [teamA] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamAId));

    throw new Error(
      `${teamA?.name || "Team A"} needs at least ${LINEUP_SIZE} players (has ${teamACount.count})`,
    );
  }

  if (teamBCount.count < LINEUP_SIZE) {
    const [teamB] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamBId));

    throw new Error(
      `${teamB?.name || "Team B"} needs at least ${LINEUP_SIZE} players (has ${teamBCount.count})`,
    );
  }

  // Get the next order position for this match day
  const [maxOrder] = await db
    .select({ maxOrder: max(matches.orderInDay) })
    .from(matches)
    .where(eq(matches.matchDayId, matchDayId));

  const orderInDay = (maxOrder?.maxOrder ?? 0) + 1;

  const [match] = await db
    .insert(matches)
    .values({
      teamAId,
      teamBId,
      matchDayId,
      orderInDay,
      scheduledDate: scheduledDate ?? null,
      locationId: locationId ?? null,
      state: "upcoming",
    })
    .returning();

  return match;
};

/**
 * Update the order of a match within its match day (swaps with adjacent match)
 */
export const updateMatchOrder = async (
  db: Database,
  matchId: number,
  newOrder: number,
): Promise<void> => {
  await db.transaction(async (tx) => {
    // Get the current match
    const currentMatch = await tx.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });

    if (!currentMatch || !currentMatch.matchDayId) {
      throw new Error("Match not found or not assigned to a match day");
    }

    const currentOrder = currentMatch.orderInDay ?? 0;

    // Find the match at the target position
    const targetMatch = await tx.query.matches.findFirst({
      where: and(
        eq(matches.matchDayId, currentMatch.matchDayId),
        eq(matches.orderInDay, newOrder),
      ),
    });

    // Swap orders
    await tx
      .update(matches)
      .set({ orderInDay: newOrder })
      .where(eq(matches.id, matchId));

    if (targetMatch) {
      await tx
        .update(matches)
        .set({ orderInDay: currentOrder })
        .where(eq(matches.id, targetMatch.id));
    }
  });
};

export interface FreezeMatchLineupsOptions {
  /** Whether to delete existing lineup entries for this match before inserting. Defaults to true. */
  overrideExisting?: boolean;
}

export const freezeMatchLineups = async (
  db: Database,
  matchId: number,
  teamAId: number,
  teamBId: number,
  options: FreezeMatchLineupsOptions = {},
) => {
  const { overrideExisting = true } = options;

  // Delete existing lineup entries if overriding
  if (overrideExisting) {
    await db
      .delete(matchBattingOrders)
      .where(eq(matchBattingOrders.matchId, matchId));
  }

  // Get all players with their lineups for both teams
  const teamAPlayers = await db
    .select({
      playerId: players.id,
      teamId: players.teamId,
      battingOrder: teamLineups.battingOrder,
      fieldingPosition: teamLineups.fieldingPosition,
      isStarred: teamLineups.isStarred,
    })
    .from(players)
    .leftJoin(teamLineups, eq(players.id, teamLineups.playerId))
    .where(eq(players.teamId, teamAId));

  const teamBPlayers = await db
    .select({
      playerId: players.id,
      teamId: players.teamId,
      battingOrder: teamLineups.battingOrder,
      fieldingPosition: teamLineups.fieldingPosition,
      isStarred: teamLineups.isStarred,
    })
    .from(players)
    .leftJoin(teamLineups, eq(players.id, teamLineups.playerId))
    .where(eq(players.teamId, teamBId));

  // Insert frozen lineup entries for team A
  for (const player of teamAPlayers) {
    if (player.battingOrder !== null) {
      await db.insert(matchBattingOrders).values({
        matchId,
        teamId: teamAId,
        playerId: player.playerId,
        battingOrder: player.battingOrder,
        fieldingPosition: player.fieldingPosition,
        isStarred: player.isStarred ?? false,
      });
    }
  }

  // Insert frozen lineup entries for team B
  for (const player of teamBPlayers) {
    if (player.battingOrder !== null) {
      await db.insert(matchBattingOrders).values({
        matchId,
        teamId: teamBId,
        playerId: player.playerId,
        battingOrder: player.battingOrder,
        fieldingPosition: player.fieldingPosition,
        isStarred: player.isStarred ?? false,
      });
    }
  }
};

export const getMatchById = async (db: Database, matchId: number) => {
  return await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      teamA: true,
      teamB: true,
      battingOrders: {
        with: {
          player: true,
          team: true,
        },
        orderBy: [asc(matchBattingOrders.battingOrder)],
      },
      playerStats: {
        with: {
          player: true,
          team: true,
        },
      },
    },
  });
};

export interface UpdateMatchStateParams {
  userId?: number;
  seasonId?: number;
}

export const updateMatchState = async (
  db: Database,
  matchId: number,
  newState: MatchState,
  params?: UpdateMatchStateParams,
) => {
  // Get current match to check state transition
  const currentMatch = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });

  if (!currentMatch) {
    throw new Error("Match not found");
  }

  const fromState = currentMatch.state;

  // If transitioning from upcoming to live, freeze the lineups
  if (currentMatch.state === "upcoming" && newState === "live") {
    const updated = await db.transaction(async (tx) => {
      // Freeze lineups for both teams
      await freezeMatchLineups(
        tx,
        matchId,
        currentMatch.teamAId,
        currentMatch.teamBId,
      );

      // Update the state
      const [result] = await tx
        .update(matches)
        .set({
          state: newState,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId))
        .returning();

      return result;
    });

    // Create event if params provided (after transaction completes successfully)
    if (params?.userId && params?.seasonId) {
      await createMatchStateChangeEvent(
        db,
        params.userId,
        matchId,
        fromState,
        newState,
        params.seasonId,
      );
    }

    return updated;
  }

  // For other state transitions, just update the state
  const [updated] = await db
    .update(matches)
    .set({
      state: newState,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))
    .returning();

  // Create event for live -> finished or other transitions
  if (params?.userId && params?.seasonId) {
    await createMatchStateChangeEvent(
      db,
      params.userId,
      matchId,
      fromState,
      newState,
      params.seasonId,
    );
  }

  return updated;
};

export const updateMatchScore = async (
  db: Database,
  matchId: number,
  teamAScore: number,
  teamBScore: number,
) => {
  const [updated] = await db
    .update(matches)
    .set({
      teamAScore,
      teamBScore,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))
    .returning();

  return updated;
};

export const deleteMatch = async (db: Database, matchId: number) => {
  await db.transaction(async (tx) => {
    // Get the match to find its matchDayId and orderInDay
    const matchToDelete = await tx.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });

    if (!matchToDelete) {
      return;
    }

    const { matchDayId, orderInDay } = matchToDelete;

    // Delete the match
    await tx.delete(matches).where(eq(matches.id, matchId));

    // Reflow orderInDay for remaining matches in the same match day
    if (matchDayId && orderInDay !== null) {
      // Get all matches in the same match day with higher orderInDay
      const matchesToUpdate = await tx
        .select({ id: matches.id, orderInDay: matches.orderInDay })
        .from(matches)
        .where(
          and(
            eq(matches.matchDayId, matchDayId),
            gt(matches.orderInDay, orderInDay),
          ),
        );

      // Decrement each match's orderInDay by 1
      for (const match of matchesToUpdate) {
        await tx
          .update(matches)
          .set({ orderInDay: (match.orderInDay ?? 0) - 1 })
          .where(eq(matches.id, match.id));
      }
    }
  });
};

export const getTeamsForMatchCreation = async (db: Database) => {
  return await db.query.teams.findMany({
    with: {
      user: true,
    },
    orderBy: [asc(teams.name)],
  });
};

export const getMatchWithStats = async (db: Database, matchId: number) => {
  return await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      teamA: {
        with: {
          captain: true,
          user: true,
          conference: true,
        },
      },
      teamB: {
        with: {
          captain: true,
          user: true,
          conference: true,
        },
      },
      location: true,
      battingOrders: {
        with: {
          player: true,
          team: true,
        },
        orderBy: [
          asc(matchBattingOrders.teamId),
          asc(matchBattingOrders.battingOrder),
        ],
      },
      playerStats: {
        with: {
          player: true,
          team: true,
        },
      },
    },
  });
};

export const getMatchLocations = async (db: Database) => {
  return await db.query.matchLocations.findMany({
    orderBy: [asc(matchLocations.name)],
  });
};

export const updateMatchLocation = async (
  db: Database,
  matchId: number,
  locationId: number | null,
) => {
  const [updated] = await db
    .update(matches)
    .set({
      locationId,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))
    .returning();

  return updated;
};

export const updateMatchVideoUrl = async (
  db: Database,
  matchId: number,
  videoUrl: string | null,
) => {
  const [updated] = await db
    .update(matches)
    .set({
      videoUrl,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))
    .returning();

  return updated;
};

export type PlayerStatInput = Omit<MatchPlayerStats, "matchId">;

export const upsertMatchPlayerStats = async (
  db: Database,
  matchId: number,
  stats: PlayerStatInput[],
) => {
  await db.transaction(async (tx) => {
    for (const stat of stats) {
      // Check if stat exists
      const existing = await tx.query.matchPlayerStats.findFirst({
        where: and(
          eq(matchPlayerStats.matchId, matchId),
          eq(matchPlayerStats.playerId, stat.playerId),
        ),
      });

      if (existing) {
        // Update existing
        await tx
          .update(matchPlayerStats)
          .set({
            plateAppearances: stat.plateAppearances,
            hits: stat.hits,
            homeRuns: stat.homeRuns,
            outs: stat.outs,
            rbi: stat.rbi,
            inningsPitchedWhole: stat.inningsPitchedWhole,
            inningsPitchedPartial: stat.inningsPitchedPartial,
            strikeouts: stat.strikeouts,
            earnedRuns: stat.earnedRuns,
            putouts: stat.putouts,
            assists: stat.assists,
            doublePlays: stat.doublePlays,
            triplePlays: stat.triplePlays,
            errors: stat.errors,
          })
          .where(
            and(
              eq(matchPlayerStats.matchId, matchId),
              eq(matchPlayerStats.playerId, stat.playerId),
            ),
          );
      } else {
        // Insert new
        await tx.insert(matchPlayerStats).values({
          matchId,
          playerId: stat.playerId,
          teamId: stat.teamId,
          plateAppearances: stat.plateAppearances,
          hits: stat.hits,
          homeRuns: stat.homeRuns,
          outs: stat.outs,
          rbi: stat.rbi,
          inningsPitchedWhole: stat.inningsPitchedWhole,
          inningsPitchedPartial: stat.inningsPitchedPartial,
          strikeouts: stat.strikeouts,
          earnedRuns: stat.earnedRuns,
          putouts: stat.putouts,
          assists: stat.assists,
          doublePlays: stat.doublePlays,
          triplePlays: stat.triplePlays,
          errors: stat.errors,
        });
      }
    }
  });
};
