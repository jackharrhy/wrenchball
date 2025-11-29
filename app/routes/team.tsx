import type { Route } from "./+types/team";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { TradeBlockDisplay } from "~/components/TradeBlockEditor";
import { getUser } from "~/auth.server";
import { Link } from "react-router";
import { Lineup } from "~/components/Lineup";
import {
  getTeamWithPlayers,
  fillPlayersToTeamSize,
  checkCanEdit,
} from "~/utils/team.server";

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;

  return date.toLocaleDateString();
}

export async function loader({
  params: { teamId },
  request,
}: Route.LoaderArgs) {
  const team = await getTeamWithPlayers(teamId);

  const players = team.players ?? [];
  const filledPlayers = fillPlayersToTeamSize(players);
  const teamWithFullPlayers = { ...team, players: filledPlayers };

  const user = await getUser(request);
  const canEdit = checkCanEdit(user, team.userId);

  return { team: teamWithFullPlayers, canEdit };
}

export default function Team({
  loaderData: { team, canEdit },
}: Route.ComponentProps) {
  // Filter out null players and split into lineup and bench
  const allPlayers = team.players.filter(
    (player): player is NonNullable<typeof player> => player !== null,
  );

  // Players with a lineup (batting order)
  const lineupPlayers = allPlayers
    .filter((player) => player.lineup?.battingOrder != null)
    .sort(
      (a, b) => (a.lineup?.battingOrder ?? 0) - (b.lineup?.battingOrder ?? 0),
    );

  // Players without a lineup (bench)
  const benchPlayers = allPlayers.filter(
    (player) => player.lineup?.battingOrder == null,
  );

  // Create team objects for each list
  const lineupTeam = {
    ...team,
    players: lineupPlayers,
  };

  const benchTeam = {
    ...team,
    players: benchPlayers,
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-rodin font-bold">{team.name}</h1>

      <div
        key={team.id}
        className="flex flex-row items-center gap-16 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4"
      >
        <div className="flex flex-col gap-6">
          {lineupPlayers.length > 0 && (
            <div className="flex flex-col gap-2">
              <TeamPlayerList team={lineupTeam} />
            </div>
          )}
          {benchPlayers.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm opacity-60">Bench:</p>
              <TeamPlayerList team={benchTeam} size="sm" />
            </div>
          )}
        </div>
        <Lineup
          players={allPlayers}
          captainId={team.captainId}
          captainStatsCharacter={team.captain?.statsCharacter}
        />
      </div>
      {/* Trade Preferences Section */}
      {(team.lookingFor || team.willingToTrade) && (
        <div className="flex flex-col gap-3 border border-cell-gray/50 bg-cell-gray/30 rounded-lg p-4 w-full max-w-2xl">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-bold text-center">Trade Block</h2>
            {team.tradeBlockUpdatedAt && (
              <span className="text-xs text-gray-400">
                (updated {formatTimeAgo(new Date(team.tradeBlockUpdatedAt))})
              </span>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <TradeBlockDisplay
              content={team.lookingFor}
              label="Looking For"
              labelColor="text-green-400"
            />
            <TradeBlockDisplay
              content={team.willingToTrade}
              label="Willing to Trade"
              labelColor="text-orange-400"
            />
          </div>
        </div>
      )}
      {canEdit && (
        <Link
          to={`/team/${team.id}/edit`}
          className="text-sm bg-blue-950 text-white px-4 py-2 rounded-md hover:bg-blue-900"
        >
          Edit
        </Link>
      )}
    </div>
  );
}
