import { eq, asc } from "drizzle-orm";
import { type Database } from "~/database/db";
import {
  matches,
  matchBattingOrders,
  matchPlayerStats,
  teamLineups,
  players,
  teams,
  type MatchState,
} from "~/database/schema";

export interface CreateMatchParams {
  teamAId: number;
  teamBId: number;
  scheduledDate?: Date | null;
}

export const createMatch = async (
  db: Database,
  { teamAId, teamBId, scheduledDate }: CreateMatchParams,
) => {
  if (teamAId === teamBId) {
    throw new Error("Team A and Team B must be different teams");
  }

  const [match] = await db
    .insert(matches)
    .values({
      teamAId,
      teamBId,
      scheduledDate: scheduledDate ?? null,
      state: "upcoming",
    })
    .returning();

  return match;
};

export const freezeMatchLineups = async (
  db: Database,
  matchId: number,
  teamAId: number,
  teamBId: number,
) => {
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

export const updateMatchState = async (
  db: Database,
  matchId: number,
  newState: MatchState,
) => {
  // Get current match to check state transition
  const currentMatch = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });

  if (!currentMatch) {
    throw new Error("Match not found");
  }

  // If transitioning from upcoming to live, freeze the lineups
  if (currentMatch.state === "upcoming" && newState === "live") {
    return await db.transaction(async (tx) => {
      // Freeze lineups for both teams
      await freezeMatchLineups(
        tx,
        matchId,
        currentMatch.teamAId,
        currentMatch.teamBId,
      );

      // Update the state
      const [updated] = await tx
        .update(matches)
        .set({
          state: newState,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId))
        .returning();

      return updated;
    });
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
  // Cascading delete will handle matchBattingOrders and matchPlayerStats
  await db.delete(matches).where(eq(matches.id, matchId));
};

export const getTeamsForMatchCreation = async (db: Database) => {
  return await db
    .select({
      id: teams.id,
      name: teams.name,
      abbreviation: teams.abbreviation,
    })
    .from(teams)
    .orderBy(asc(teams.name));
};
