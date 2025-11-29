import { Link } from "react-router";
import type { Route } from "./+types/match";
import { db } from "~/database/db";
import { getMatchWithStats } from "~/utils/matches.server";
import { PlayerIcon } from "~/components/PlayerIcon";
import { Lineup } from "~/components/Lineup";
import { cn } from "~/utils/cn";
import { formatTeamName } from "~/utils/formatTeamName";

export async function loader({ params: { matchId } }: Route.LoaderArgs) {
  const match = await getMatchWithStats(db, parseInt(matchId, 10));

  if (!match) {
    throw new Response("Match not found", { status: 404 });
  }

  return { match };
}

function formatDate(date: Date | null) {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function getStateColor(state: string) {
  switch (state) {
    case "upcoming":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "live":
      return "bg-green-500/20 text-green-300 border-green-500/40";
    case "finished":
      return "bg-gray-500/20 text-gray-300 border-gray-500/40";
    default:
      return "bg-gray-500/20 text-gray-300 border-gray-500/40";
  }
}

// Stat columns configuration
const STAT_COLUMNS = [
  { key: "plateAppearances", label: "PA", title: "Plate Appearances" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "homeRuns", label: "HR", title: "Home Runs" },
  { key: "outs", label: "O", title: "Outs" },
  { key: "rbi", label: "RBI", title: "Runs Batted In" },
  { key: "inningsPitched", label: "IP", title: "Innings Pitched" },
  { key: "strikeouts", label: "K", title: "Strikeouts" },
  { key: "earnedRuns", label: "ER", title: "Earned Runs" },
  { key: "putouts", label: "PO", title: "Putouts" },
  { key: "assists", label: "A", title: "Assists" },
  { key: "doublePlays", label: "DP", title: "Double Plays" },
  { key: "triplePlays", label: "TP", title: "Triple Plays" },
  { key: "errors", label: "E", title: "Errors" },
] as const;

export default function Match({ loaderData }: Route.ComponentProps) {
  const { match } = loaderData;

  const showScore =
    match.state === "finished" &&
    match.teamAScore !== null &&
    match.teamBScore !== null;

  // Group batting orders by team
  const teamALineup = match.battingOrders
    .filter((bo) => bo.teamId === match.teamAId)
    .sort((a, b) => a.battingOrder - b.battingOrder);
  const teamBLineup = match.battingOrders
    .filter((bo) => bo.teamId === match.teamBId)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Transform batting orders to Field-compatible format
  const teamAPlayersForField = teamALineup.map((bo) => ({
    ...bo.player,
    lineup: {
      playerId: bo.playerId,
      fieldingPosition: bo.fieldingPosition,
      battingOrder: bo.battingOrder,
      isStarred: bo.isStarred,
    },
  }));
  const teamBPlayersForField = teamBLineup.map((bo) => ({
    ...bo.player,
    lineup: {
      playerId: bo.playerId,
      fieldingPosition: bo.fieldingPosition,
      battingOrder: bo.battingOrder,
      isStarred: bo.isStarred,
    },
  }));

  // Create a map of player stats by playerId
  const statsMap = new Map(match.playerStats.map((ps) => [ps.playerId, ps]));

  // Get innings pitched display
  const getInningsPitched = (playerId: number) => {
    const stats = statsMap.get(playerId);
    if (!stats) return "-";
    const whole = stats.inningsPitchedWhole ?? 0;
    const partial = stats.inningsPitchedPartial ?? 0;
    if (whole === 0 && partial === 0) return "-";
    return `${whole}.${partial}`;
  };

  // Get stat value
  const getStatValue = (playerId: number, key: string): string | number => {
    const stats = statsMap.get(playerId);
    if (!stats) return "-";
    if (key === "inningsPitched") return getInningsPitched(playerId);
    const value = stats[key as keyof typeof stats];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
    return "-";
  };

  return (
    <div className="space-y-8">
      {/* Match Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-4">
          <span
            className={cn(
              "px-3 py-1 text-sm font-semibold rounded border capitalize",
              getStateColor(match.state),
            )}
          >
            {match.state}
          </span>
        </div>

        <div className="flex items-center justify-center gap-8">
          <Link
            to={`/team/${match.teamA.id}`}
            className="text-2xl font-bold hover:underline"
          >
            {formatTeamName(match.teamA)}
          </Link>
          {showScore ? (
            <div className="flex items-center gap-4">
              <span className="text-4xl font-bold text-yellow-300">
                {match.teamAScore}
              </span>
              <span className="text-2xl text-gray-400">-</span>
              <span className="text-4xl font-bold text-yellow-300">
                {match.teamBScore}
              </span>
            </div>
          ) : (
            <span className="text-2xl text-gray-400">vs</span>
          )}
          <Link
            to={`/team/${match.teamB.id}`}
            className="text-2xl font-bold hover:underline"
          >
            {formatTeamName(match.teamB)}
          </Link>
        </div>

        <p className="text-gray-400">{formatDate(match.scheduledDate)}</p>
      </div>

      {/* Lineups */}
      {(teamALineup.length > 0 || teamBLineup.length > 0) && (
        <div className="flex flex-wrap justify-center gap-48">
          {/* Team A Field */}
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-bold mb-4">{formatTeamName(match.teamA)}</h3>
            <Lineup
              players={teamAPlayersForField}
              captainId={match.teamA.captainId}
              captainStatsCharacter={match.teamA.captain?.statsCharacter}
            />
          </div>

          {/* Team B Field */}
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-bold mb-4">{formatTeamName(match.teamB)}</h3>
            <Lineup
              players={teamBPlayersForField}
              captainId={match.teamB.captainId}
              captainStatsCharacter={match.teamB.captain?.statsCharacter}
            />
          </div>
        </div>
      )}

      {/* Player Stats Table */}
      {match.state === "finished" && match.playerStats.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-center">Player Stats</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-cell-gray/60">
                  <th className="sticky left-0 z-10 bg-cell-gray/80 p-2 text-left border border-cell-gray/50">
                    Player
                  </th>
                  <th className="p-2 text-left border border-cell-gray/50">
                    Team
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
                {/* Team A players */}
                {teamALineup.map((bo) => (
                  <tr
                    key={bo.playerId}
                    className="hover:bg-cell-gray/40 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-cell-gray/60 p-2 border border-cell-gray/50">
                      <div className="flex items-center gap-2">
                        <PlayerIcon
                          player={bo.player}
                          size="sm"
                          isStarred={bo.isStarred}
                          isCaptain={
                            bo.teamId === match.teamAId
                              ? match.teamA.captainId !== null &&
                                match.teamA.captainId !== undefined &&
                                bo.playerId === match.teamA.captainId
                              : match.teamB.captainId !== null &&
                                match.teamB.captainId !== undefined &&
                                bo.playerId === match.teamB.captainId
                          }
                        />
                        <Link
                          to={`/player/${bo.playerId}`}
                          className="hover:underline"
                        >
                          {bo.player.name}
                        </Link>
                      </div>
                    </td>
                    <td className="p-2 border border-cell-gray/50 text-sm text-gray-400">
                      {formatTeamName(match.teamA)}
                    </td>
                    {STAT_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="p-2 text-center border border-cell-gray/50"
                      >
                        {getStatValue(bo.playerId, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Divider row */}
                {teamALineup.length > 0 && teamBLineup.length > 0 && (
                  <tr>
                    <td
                      colSpan={STAT_COLUMNS.length + 2}
                      className="h-8 bg-cell-gray/20"
                    />
                  </tr>
                )}
                {/* Team B players */}
                {teamBLineup.map((bo) => (
                  <tr
                    key={bo.playerId}
                    className="hover:bg-cell-gray/40 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-cell-gray/60 p-2 border border-cell-gray/50">
                      <div className="flex items-center gap-2">
                        <PlayerIcon
                          player={bo.player}
                          size="sm"
                          isStarred={bo.isStarred}
                          isCaptain={
                            bo.teamId === match.teamAId
                              ? match.teamA.captainId !== null &&
                                match.teamA.captainId !== undefined &&
                                bo.playerId === match.teamA.captainId
                              : match.teamB.captainId !== null &&
                                match.teamB.captainId !== undefined &&
                                bo.playerId === match.teamB.captainId
                          }
                        />
                        <Link
                          to={`/player/${bo.playerId}`}
                          className="hover:underline"
                        >
                          {bo.player.name}
                        </Link>
                      </div>
                    </td>
                    <td className="p-2 border border-cell-gray/50 text-sm text-gray-400">
                      {formatTeamName(match.teamB)}
                    </td>
                    {STAT_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="p-2 text-center border border-cell-gray/50"
                      >
                        {getStatValue(bo.playerId, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No stats message for finished matches */}
      {match.state === "finished" && match.playerStats.length === 0 && (
        <div className="text-center text-gray-400 italic py-8">
          No player stats recorded yet.
        </div>
      )}

      {/* Back link */}
      <div className="text-center">
        <Link to="/matches" className="text-cyan-300 hover:underline">
          ← Back to Matches
        </Link>
      </div>
    </div>
  );
}
