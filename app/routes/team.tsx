import type { Route } from "./+types/team";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { getUser } from "~/auth.server";
import { Link } from "react-router";
import { Field } from "~/components/Field";
import {
  getTeamWithPlayers,
  fillPlayersToTeamSize,
  checkCanEdit,
} from "~/utils/team.server";

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
  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-rodin font-bold">{team.name}</h1>

      <div
        key={team.id}
        className="flex flex-row items-center gap-16 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4"
      >
        <TeamPlayerList team={team} />
        <Field
          players={team.players.filter((player) => player !== null)}
          captainId={team.captainId}
          captainStatsCharacter={team.captain?.statsCharacter}
        />
      </div>
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
