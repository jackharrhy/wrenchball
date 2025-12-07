import { Link } from "react-router";
import { PlayerIcon } from "~/components/PlayerIcon";
import { TeamLogo } from "~/components/TeamLogo";
import type { PlayerWithStats } from "~/utils/leaderboard.server";

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

// Get innings pitched display
function getInningsPitched(player: PlayerWithStats) {
  const stats = player.aggregatedStats;
  if (!stats) return "-";
  const whole = stats.totalInningsPitchedWhole ?? 0;
  const partial = stats.totalInningsPitchedPartial ?? 0;
  if (whole === 0 && partial === 0) return "-";
  // Normalize partial innings (convert every 3 to 1 whole)
  const totalPartial = partial % 3;
  const extraWhole = Math.floor(partial / 3);
  return `${whole + extraWhole}.${totalPartial}`;
}

// Get stat value
function getStatValue(player: PlayerWithStats, key: string): string | number {
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
}

type LeaderboardTableProps = {
  players: PlayerWithStats[];
};

export function LeaderboardTable({ players }: LeaderboardTableProps) {
  return (
    <div className="overflow-x-auto">
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
                      captainStatsCharacter={player.team.captain?.statsCharacter}
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

