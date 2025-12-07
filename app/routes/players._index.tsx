import { PlayerIcon } from "~/components/PlayerIcon";
import type { Route } from "./+types/players._index";
import { db } from "~/database/db";
import { Link } from "react-router";
import { TeamLogo } from "~/components/TeamLogo";
import { matchPlayerStats } from "~/database/schema";
import { sql } from "drizzle-orm";

// Type for aggregated stats
type AggregatedStats = {
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

export async function loader({ request }: Route.LoaderArgs) {
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

  return { players: playersWithStats };
}

// Stat columns configuration - same as match page, with Hit% first
const STAT_COLUMNS = [
  { key: "hitRatePct", label: "Hit%", title: "Hit Rate Percentage" },
  { key: "totalPlateAppearances", label: "PA", title: "Plate Appearances" },
  { key: "totalHits", label: "H", title: "Hits" },
  { key: "totalHomeRuns", label: "HR", title: "Home Runs" },
  { key: "totalOuts", label: "O", title: "Outs" },
  { key: "totalRbi", label: "RBI", title: "Runs Batted In" },
  { key: "inningsPitched", label: "IP", title: "Innings Pitched" },
  { key: "totalStrikeouts", label: "K", title: "Strikeouts" },
  { key: "totalEarnedRuns", label: "ER", title: "Earned Runs" },
  { key: "totalPutouts", label: "PO", title: "Putouts" },
  { key: "totalAssists", label: "A", title: "Assists" },
  { key: "totalDoublePlays", label: "DP", title: "Double Plays" },
  { key: "totalTriplePlays", label: "TP", title: "Triple Plays" },
  { key: "totalErrors", label: "E", title: "Errors" },
] as const;

type PlayerWithStats = Awaited<ReturnType<typeof loader>>["players"][number];

export default function PlayersLeaderboard({
  loaderData,
}: Route.ComponentProps) {
  const { players } = loaderData;

  // Get innings pitched display
  const getInningsPitched = (player: PlayerWithStats) => {
    const stats = player.aggregatedStats;
    if (!stats) return "-";
    const whole = stats.totalInningsPitchedWhole ?? 0;
    const partial = stats.totalInningsPitchedPartial ?? 0;
    if (whole === 0 && partial === 0) return "-";
    // Normalize partial innings (convert every 3 to 1 whole)
    const totalPartial = partial % 3;
    const extraWhole = Math.floor(partial / 3);
    return `${whole + extraWhole}.${totalPartial}`;
  };

  // Get stat value
  const getStatValue = (
    player: PlayerWithStats,
    key: string,
  ): string | number => {
    const stats = player.aggregatedStats;
    if (!stats) return "-";
    if (key === "inningsPitched") return getInningsPitched(player);
    if (key === "hitRatePct") {
      const pct = stats.hitRatePct;
      if (pct === null) return "-";
      return `${pct}%`;
    }
    const value = stats[key as keyof typeof stats];
    if (typeof value === "number") {
      return value;
    }
    return "-";
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-cell-gray/60">
            <th className="sticky left-0 z-10 bg-cell-gray/80 p-2 text-left border border-cell-gray/50">
              Player
            </th>
            <th className="p-2 text-left border border-cell-gray/50">Team</th>
            <th
              className="p-2 text-center border border-cell-gray/50 min-w-[3rem]"
              title="Matches Played"
            >
              GP
            </th>
            {STAT_COLUMNS.map((col) => (
              <th
                key={col.key}
                className="p-2 text-center border border-cell-gray/50 min-w-[3rem]"
                title={col.title}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr
              key={player.id}
              className="hover:bg-cell-gray/40 transition-colors"
            >
              <td className="sticky left-0 z-10 bg-cell-gray/60 p-2 border border-cell-gray/50">
                <div className="flex items-center gap-2">
                  <PlayerIcon
                    player={player}
                    size="sm"
                    isStarred={player.lineup?.isStarred ?? false}
                    isCaptain={
                      player.team?.captainId !== null &&
                      player.team?.captainId !== undefined &&
                      player.id === player.team.captainId
                    }
                  />
                  <Link to={`/player/${player.id}`} className="hover:underline">
                    {player.name}
                  </Link>
                </div>
              </td>
              <td className="p-2 border border-cell-gray/50 text-sm text-gray-400">
                {player.team ? (
                  <Link
                    to={`/team/${player.team.id}`}
                    className="flex items-center gap-1 hover:underline"
                  >
                    <TeamLogo
                      captainStatsCharacter={
                        player.team.captain?.statsCharacter
                      }
                      size="xs"
                    />
                    {player.team.abbreviation}
                  </Link>
                ) : (
                  <span className="text-green-300/50">Free</span>
                )}
              </td>
              <td className="p-2 text-center border border-cell-gray/50">
                {player.aggregatedStats?.matchCount ?? 0}
              </td>
              {STAT_COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="p-2 text-center border border-cell-gray/50"
                >
                  {getStatValue(player, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
