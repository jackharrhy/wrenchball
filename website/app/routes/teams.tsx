import type { Player } from "~/database/schema";
import type { Route } from "./+types/teams";
import { database } from "~/database/context";
import { Link } from "react-router";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { TEAM_SIZE } from "~/consts";

export async function loader({ request }: Route.LoaderArgs) {
  const db = database();

  const allTeams = await db.query.teams.findMany({
    with: {
      players: true,
    },
    orderBy: (teams, { asc }) => asc(teams.id),
  });

  const teamsWithFullPlayers = allTeams.map((team) => {
    const players = team.players ?? [];
    const filledPlayers: (Player | null)[] = [...players];
    while (filledPlayers.length < TEAM_SIZE) {
      filledPlayers.push(null);
    }
    return { ...team, players: filledPlayers };
  });

  return { teams: teamsWithFullPlayers };
}

export default function Teams({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {loaderData.teams.map((team) => (
          <Link
            to={`/team/${team.id}`}
            className="flex flex-col gap-4 group"
            key={team.id}
          >
            <p className="text-lg font-rodin font-bold text-center">
              {team.name}
            </p>
            <div className="flex flex-col gap-1 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4 w-60 transition-colors group-hover:bg-cell-gray/60">
              <TeamPlayerList team={team} size="sm" link={false} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
