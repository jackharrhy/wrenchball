import type { Player } from "~/database/schema";
import type { Route } from "./+types/team";
import { database } from "~/database/context";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { getUser } from "~/auth.server";
import { Link } from "react-router";
import { TEAM_SIZE } from "~/consts";
import { Field } from "~/components/Field";

export async function loader({
  params: { teamId },
  request,
}: Route.LoaderArgs) {
  const db = database();

  const team = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.id, Number(teamId)),
    with: {
      players: {
        with: {
          lineup: true,
        },
      },
    },
  });

  if (!team) {
    throw new Response("Team not found", { status: 404 });
  }

  const players = team.players ?? [];
  const filledPlayers: (Player | null)[] = [...players];
  while (filledPlayers.length < TEAM_SIZE) {
    filledPlayers.push(null);
  }
  const teamWithFullPlayers = { ...team, players: filledPlayers };

  const user = await getUser(request);

  let canEdit = false;

  if (user?.id === team.userId || user?.role === "admin") {
    canEdit = true;
  }

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
        <Field players={team.players.filter((player) => player !== null)} />
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
