import { sql } from "drizzle-orm";
import { matchPlayerStats } from "~/database/schema";
import type { db as Database } from "~/database/db";

// Type for aggregated stats
export type AggregatedStats = {
  playerId: number;
  matchCount: number;
  totalPlateAppearances: number;
  totalHits: number;
  totalHomeRuns: number;
  totalOuts: number;
  totalRbi: number;
  totalInningsPitchedWhole: number;
  totalInningsPitchedPartial: number;
  totalStrikeouts: number;
  totalEarnedRuns: number;
  totalPutouts: number;
  totalAssists: number;
  totalDoublePlays: number;
  totalTriplePlays: number;
  totalErrors: number;
  hitRatePct: number | null;
};

// Type for player with stats - will be inferred from the return type
export type PlayerWithStats = Awaited<
  ReturnType<typeof getLeaderboardData>
>[number];

/**
 * Fetches leaderboard data with aggregated stats for all players.
 * Returns players sorted by hit rate percentage (descending).
 * @param db - Database instance
 * @param limit - Optional limit for number of players to return
 */
export async function getLeaderboardData(
  db: typeof Database,
  limit?: number,
) {
  // Get all players with their team info
  const allPlayers = await db.query.players.findMany({
    with: {
      team: {
        with: {
          captain: true,
        },
      },
      lineup: true,
    },
    orderBy: (players, { asc }) => asc(players.sortPosition),
  });

  // Aggregate stats directly with a query
  const aggregatedStats = await db
    .select({
      playerId: matchPlayerStats.playerId,
      matchCount: sql<number>`COUNT(DISTINCT ${matchPlayerStats.matchId})::integer`,
      totalPlateAppearances: sql<number>`COALESCE(SUM(${matchPlayerStats.plateAppearances}), 0)::integer`,
      totalHits: sql<number>`COALESCE(SUM(${matchPlayerStats.hits}), 0)::integer`,
      totalHomeRuns: sql<number>`COALESCE(SUM(${matchPlayerStats.homeRuns}), 0)::integer`,
      totalOuts: sql<number>`COALESCE(SUM(${matchPlayerStats.outs}), 0)::integer`,
      totalRbi: sql<number>`COALESCE(SUM(${matchPlayerStats.rbi}), 0)::integer`,
      totalInningsPitchedWhole: sql<number>`COALESCE(SUM(${matchPlayerStats.inningsPitchedWhole}), 0)::integer`,
      totalInningsPitchedPartial: sql<number>`COALESCE(SUM(${matchPlayerStats.inningsPitchedPartial}), 0)::integer`,
      totalStrikeouts: sql<number>`COALESCE(SUM(${matchPlayerStats.strikeouts}), 0)::integer`,
      totalEarnedRuns: sql<number>`COALESCE(SUM(${matchPlayerStats.earnedRuns}), 0)::integer`,
      totalPutouts: sql<number>`COALESCE(SUM(${matchPlayerStats.putouts}), 0)::integer`,
      totalAssists: sql<number>`COALESCE(SUM(${matchPlayerStats.assists}), 0)::integer`,
      totalDoublePlays: sql<number>`COALESCE(SUM(${matchPlayerStats.doublePlays}), 0)::integer`,
      totalTriplePlays: sql<number>`COALESCE(SUM(${matchPlayerStats.triplePlays}), 0)::integer`,
      totalErrors: sql<number>`COALESCE(SUM(${matchPlayerStats.errors}), 0)::integer`,
      hitRatePct: sql<number | null>`ROUND(
        COALESCE(SUM(${matchPlayerStats.hits}), 0)::numeric 
        / NULLIF(COALESCE(SUM(${matchPlayerStats.plateAppearances}), 0), 0) * 100,
        1
      )`,
    })
    .from(matchPlayerStats)
    .groupBy(matchPlayerStats.playerId);

  // Create a map of playerId to stats
  const statsMap = new Map<number, AggregatedStats>(
    aggregatedStats.map((stat) => [stat.playerId, stat]),
  );

  // Combine players with their aggregated stats and sort by hit rate
  const playersWithStats = allPlayers
    .map((player) => ({
      ...player,
      aggregatedStats: statsMap.get(player.id) ?? null,
    }))
    .sort((a, b) => {
      const aRate = a.aggregatedStats?.hitRatePct ?? -1;
      const bRate = b.aggregatedStats?.hitRatePct ?? -1;
      return bRate - aRate; // Descending order
    });

  // Apply limit if specified
  if (limit !== undefined) {
    return playersWithStats.slice(0, limit);
  }

  return playersWithStats;
}

