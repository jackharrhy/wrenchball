import { eq, asc } from "drizzle-orm";
import { matches, matchDays } from "~/database/schema";
import type { Database } from "~/database/db";

export type MatchDayResult = {
  matchDayId: number;
  matchDayName: string | null;
  userScore: number;
  opponentScore: number;
  isWin: boolean;
};

export type StandingsRow = {
  userId: number;
  userName: string;
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  captainStatsCharacter: string | null;
  matchDayResults: Map<number, MatchDayResult>;
  wins: number;
  losses: number;
  wlRatio: number; // wins - losses
  runDifferential: number;
};

export type StandingsData = {
  matchDays: Array<{
    id: number;
    name: string | null;
    orderInSeason: number | null;
  }>;
  standings: StandingsRow[];
};

/**
 * Fetches standings data for all users based on finished matches.
 * Returns matchdays that have at least one finished match, and standings sorted by W/L ratio then RD.
 */
export async function getStandingsData(db: Database): Promise<StandingsData> {
  // Get all matchdays ordered by their order in season
  const allMatchDays = await db.query.matchDays.findMany({
    orderBy: [asc(matchDays.orderInSeason)],
  });

  // Get all finished matches with team info
  const finishedMatches = await db.query.matches.findMany({
    where: eq(matches.state, "finished"),
    with: {
      teamA: {
        with: {
          user: true,
          captain: true,
        },
      },
      teamB: {
        with: {
          user: true,
          captain: true,
        },
      },
    },
  });

  // Build a map of userId -> standings data
  const standingsMap = new Map<number, StandingsRow>();

  for (const match of finishedMatches) {
    if (match.teamAScore === null || match.teamBScore === null) continue;
    if (!match.matchDayId) continue;

    const matchDay = allMatchDays.find((md) => md.id === match.matchDayId);
    if (!matchDay) continue;

    // Process team A
    const userA = match.teamA.user;
    if (userA) {
      if (!standingsMap.has(userA.id)) {
        standingsMap.set(userA.id, {
          userId: userA.id,
          userName: userA.name,
          teamId: match.teamA.id,
          teamName: match.teamA.name,
          teamAbbreviation: match.teamA.abbreviation,
          captainStatsCharacter: match.teamA.captain?.statsCharacter ?? null,
          matchDayResults: new Map(),
          wins: 0,
          losses: 0,
          wlRatio: 0,
          runDifferential: 0,
        });
      }

      const rowA = standingsMap.get(userA.id)!;
      const isWinA = match.teamAScore > match.teamBScore;

      rowA.matchDayResults.set(match.matchDayId, {
        matchDayId: match.matchDayId,
        matchDayName: matchDay.name,
        userScore: match.teamAScore,
        opponentScore: match.teamBScore,
        isWin: isWinA,
      });

      if (isWinA) {
        rowA.wins++;
      } else {
        rowA.losses++;
      }
      rowA.runDifferential += match.teamAScore - match.teamBScore;
    }

    // Process team B
    const userB = match.teamB.user;
    if (userB) {
      if (!standingsMap.has(userB.id)) {
        standingsMap.set(userB.id, {
          userId: userB.id,
          userName: userB.name,
          teamId: match.teamB.id,
          teamName: match.teamB.name,
          teamAbbreviation: match.teamB.abbreviation,
          captainStatsCharacter: match.teamB.captain?.statsCharacter ?? null,
          matchDayResults: new Map(),
          wins: 0,
          losses: 0,
          wlRatio: 0,
          runDifferential: 0,
        });
      }

      const rowB = standingsMap.get(userB.id)!;
      const isWinB = match.teamBScore > match.teamAScore;

      rowB.matchDayResults.set(match.matchDayId, {
        matchDayId: match.matchDayId,
        matchDayName: matchDay.name,
        userScore: match.teamBScore,
        opponentScore: match.teamAScore,
        isWin: isWinB,
      });

      if (isWinB) {
        rowB.wins++;
      } else {
        rowB.losses++;
      }
      rowB.runDifferential += match.teamBScore - match.teamAScore;
    }
  }

  // Calculate W/L ratio for each row
  for (const row of standingsMap.values()) {
    row.wlRatio = row.wins - row.losses;
  }

  // Get matchdays that have at least one finished match
  const matchDaysWithFinishedMatches = allMatchDays.filter((md) =>
    finishedMatches.some((m) => m.matchDayId === md.id),
  );

  // Sort standings: W/L ratio desc, then run differential desc
  const sortedStandings = [...standingsMap.values()].sort((a, b) => {
    if (b.wlRatio !== a.wlRatio) {
      return b.wlRatio - a.wlRatio;
    }
    return b.runDifferential - a.runDifferential;
  });

  return {
    matchDays: matchDaysWithFinishedMatches.map((md) => ({
      id: md.id,
      name: md.name,
      orderInSeason: md.orderInSeason,
    })),
    standings: sortedStandings,
  };
}

/**
 * Serializes standings data for transport (converts Maps to arrays)
 */
export function serializeStandingsData(data: StandingsData) {
  return {
    matchDays: data.matchDays,
    standings: data.standings.map((row) => ({
      ...row,
      matchDayResults: Array.from(row.matchDayResults.entries()),
    })),
  };
}

export type SerializedStandingsData = ReturnType<typeof serializeStandingsData>;

/**
 * Deserializes standings data (converts arrays back to Maps)
 */
export function deserializeStandingsData(
  data: SerializedStandingsData,
): StandingsData {
  return {
    matchDays: data.matchDays,
    standings: data.standings.map((row) => ({
      ...row,
      matchDayResults: new Map(row.matchDayResults),
    })),
  };
}
