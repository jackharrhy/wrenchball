import { redirect, Form, Link } from "react-router";
import type { Route } from "./+types/admin-match-stats";
import { requireUser } from "~/auth.server";
import { db } from "~/database/db";
import {
  getMatchWithStats,
  upsertMatchPlayerStats,
} from "~/utils/matches.server";
import { PlayerIcon } from "~/components/PlayerIcon";
import { formatTeamName } from "~/utils/formatTeamName";

export async function loader({
  params: { matchId },
  request,
}: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const match = await getMatchWithStats(db, parseInt(matchId, 10));

  if (!match) {
    throw new Response("Match not found", { status: 404 });
  }

  if (match.state !== "finished") {
    throw redirect(`/admin?error=Match must be finished to edit stats`);
  }

  return { match };
}

export async function action({
  params: { matchId },
  request,
}: Route.ActionArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const match = await getMatchWithStats(db, parseInt(matchId, 10));

  if (!match) {
    throw new Response("Match not found", { status: 404 });
  }

  if (match.state !== "finished") {
    return { success: false, message: "Match must be finished to edit stats" };
  }

  const formData = await request.formData();

  // Build stats array from form data
  const stats: Array<{
    playerId: number;
    teamId: number;
    plateAppearances: number | null;
    hits: number | null;
    homeRuns: number | null;
    outs: number | null;
    rbi: number | null;
    inningsPitchedWhole: number | null;
    inningsPitchedPartial: number | null;
    strikeouts: number | null;
    earnedRuns: number | null;
    putouts: number | null;
    assists: number | null;
    doublePlays: number | null;
    triplePlays: number | null;
    errors: number | null;
  }> = [];

  // Get all players from batting orders
  const allPlayers = match.battingOrders;

  for (const bo of allPlayers) {
    const parseIntOrNull = (key: string) => {
      const value = formData.get(`${bo.playerId}_${key}`);
      if (value === null || value === "" || value === undefined) return null;
      const parsed = parseInt(value as string, 10);
      return isNaN(parsed) ? null : parsed;
    };

    stats.push({
      playerId: bo.playerId,
      teamId: bo.teamId,
      plateAppearances: parseIntOrNull("plateAppearances"),
      hits: parseIntOrNull("hits"),
      homeRuns: parseIntOrNull("homeRuns"),
      outs: parseIntOrNull("outs"),
      rbi: parseIntOrNull("rbi"),
      inningsPitchedWhole: parseIntOrNull("inningsPitchedWhole"),
      inningsPitchedPartial: parseIntOrNull("inningsPitchedPartial"),
      strikeouts: parseIntOrNull("strikeouts"),
      earnedRuns: parseIntOrNull("earnedRuns"),
      putouts: parseIntOrNull("putouts"),
      assists: parseIntOrNull("assists"),
      doublePlays: parseIntOrNull("doublePlays"),
      triplePlays: parseIntOrNull("triplePlays"),
      errors: parseIntOrNull("errors"),
    });
  }

  try {
    await upsertMatchPlayerStats(db, parseInt(matchId, 10), stats);
    return { success: true, message: "Stats saved successfully" };
  } catch (error) {
    console.error("Error saving stats:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to save stats",
    };
  }
}

// Stat columns configuration for the editor
const STAT_COLUMNS = [
  {
    key: "plateAppearances",
    label: "PA",
    title: "Plate Appearances",
    category: "batting",
  },
  { key: "hits", label: "H", title: "Hits", category: "batting" },
  { key: "homeRuns", label: "HR", title: "Home Runs", category: "batting" },
  { key: "outs", label: "O", title: "Outs", category: "batting" },
  { key: "rbi", label: "RBI", title: "Runs Batted In", category: "batting" },
  {
    key: "inningsPitchedWhole",
    label: "IP",
    title: "Innings Pitched (whole)",
    category: "pitching",
  },
  {
    key: "inningsPitchedPartial",
    label: "IP⅓",
    title: "Innings Pitched (thirds: 0-2)",
    category: "pitching",
  },
  { key: "strikeouts", label: "K", title: "Strikeouts", category: "pitching" },
  {
    key: "earnedRuns",
    label: "ER",
    title: "Earned Runs",
    category: "pitching",
  },
  { key: "putouts", label: "PO", title: "Putouts", category: "fielding" },
  { key: "assists", label: "A", title: "Assists", category: "fielding" },
  {
    key: "doublePlays",
    label: "DP",
    title: "Double Plays",
    category: "fielding",
  },
  {
    key: "triplePlays",
    label: "TP",
    title: "Triple Plays",
    category: "fielding",
  },
  { key: "errors", label: "E", title: "Errors", category: "silly" },
] as const;

export default function AdminMatchStats({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { match } = loaderData;

  // Group batting orders by team
  const teamALineup = match.battingOrders
    .filter((bo) => bo.teamId === match.teamAId)
    .sort((a, b) => a.battingOrder - b.battingOrder);
  const teamBLineup = match.battingOrders
    .filter((bo) => bo.teamId === match.teamBId)
    .sort((a, b) => a.battingOrder - b.battingOrder);

  // Create a map of player stats by playerId
  const statsMap = new Map(match.playerStats.map((ps) => [ps.playerId, ps]));

  // Get stat value for a player
  const getStatValue = (playerId: number, key: string): string | number => {
    const stats = statsMap.get(playerId);
    if (!stats) return "";
    const value = stats[key as keyof typeof stats];
    if (typeof value === "number") {
      return value;
    }
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Edit Stats: {formatTeamName(match.teamA)} vs {formatTeamName(match.teamB)}
        </h1>
        <Link to="/admin" className="text-cyan-300 hover:underline">
          ← Back to Admin
        </Link>
      </div>

      {actionData?.message && (
        <div
          className={`p-4 rounded ${
            actionData.success
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {actionData.message}
        </div>
      )}

      <Form method="post">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-cell-gray/60">
                <th className="sticky left-0 z-10 bg-cell-gray/80 p-2 text-left border border-cell-gray/50 min-w-[180px]">
                  Player
                </th>
                <th className="p-2 text-left border border-cell-gray/50">
                  Pos
                </th>
                {STAT_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`p-2 text-center border border-cell-gray/50 min-w-[60px] ${
                      col.category === "batting"
                        ? "bg-blue-900/30"
                        : col.category === "pitching"
                          ? "bg-green-900/30"
                          : col.category === "fielding"
                            ? "bg-purple-900/30"
                            : "bg-red-900/30"
                    }`}
                    title={col.title}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
              {/* Category header */}
              <tr className="bg-cell-gray/40">
                <th className="sticky left-0 z-10 bg-cell-gray/60 p-1 border border-cell-gray/50" />
                <th className="p-1 border border-cell-gray/50" />
                <th
                  colSpan={5}
                  className="p-1 text-center border border-cell-gray/50 bg-blue-900/20 text-blue-300 text-xs"
                >
                  Batting
                </th>
                <th
                  colSpan={4}
                  className="p-1 text-center border border-cell-gray/50 bg-green-900/20 text-green-300 text-xs"
                >
                  Pitching
                </th>
                <th
                  colSpan={4}
                  className="p-1 text-center border border-cell-gray/50 bg-purple-900/20 text-purple-300 text-xs"
                >
                  Fielding
                </th>
                <th className="p-1 text-center border border-cell-gray/50 bg-red-900/20 text-red-300 text-xs">
                  Silly
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Team A header */}
              <tr className="bg-cell-gray/50">
                <td
                  colSpan={STAT_COLUMNS.length + 2}
                  className="p-2 font-bold border border-cell-gray/50"
                >
                  {formatTeamName(match.teamA)}
                </td>
              </tr>
              {/* Team A players */}
              {teamALineup.map((bo) => (
                <tr
                  key={bo.playerId}
                  className="hover:bg-cell-gray/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-cell-gray/60 p-2 border border-cell-gray/50">
                    <div className="flex items-center gap-2">
                      <PlayerIcon player={bo.player} size="sm" />
                      <span className="truncate">{bo.player.name}</span>
                    </div>
                  </td>
                  <td className="p-2 border border-cell-gray/50 text-center text-gray-400">
                    {bo.fieldingPosition}
                  </td>
                  {STAT_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="p-1 border border-cell-gray/50"
                    >
                      <input
                        type="number"
                        name={`${bo.playerId}_${col.key}`}
                        defaultValue={getStatValue(bo.playerId, col.key)}
                        min={0}
                        max={
                          col.key === "inningsPitchedPartial" ? 2 : undefined
                        }
                        className="w-full px-1 py-1 text-center bg-cell-gray/40 border border-cell-gray/30 rounded text-white focus:outline-none focus:border-blue-500"
                        placeholder="-"
                      />
                    </td>
                  ))}
                </tr>
              ))}

              {/* Team B header */}
              <tr className="bg-cell-gray/50">
                <td
                  colSpan={STAT_COLUMNS.length + 2}
                  className="p-2 font-bold border border-cell-gray/50"
                >
                  {formatTeamName(match.teamB)}
                </td>
              </tr>
              {/* Team B players */}
              {teamBLineup.map((bo) => (
                <tr
                  key={bo.playerId}
                  className="hover:bg-cell-gray/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-cell-gray/60 p-2 border border-cell-gray/50">
                    <div className="flex items-center gap-2">
                      <PlayerIcon player={bo.player} size="sm" />
                      <span className="truncate">{bo.player.name}</span>
                    </div>
                  </td>
                  <td className="p-2 border border-cell-gray/50 text-center text-gray-400">
                    {bo.fieldingPosition}
                  </td>
                  {STAT_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="p-1 border border-cell-gray/50"
                    >
                      <input
                        type="number"
                        name={`${bo.playerId}_${col.key}`}
                        defaultValue={getStatValue(bo.playerId, col.key)}
                        min={0}
                        max={
                          col.key === "inningsPitchedPartial" ? 2 : undefined
                        }
                        className="w-full px-1 py-1 text-center bg-cell-gray/40 border border-cell-gray/30 rounded text-white focus:outline-none focus:border-blue-500"
                        placeholder="-"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <Link
            to="/admin"
            className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 text-white"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            Save Stats
          </button>
        </div>
      </Form>
    </div>
  );
}
