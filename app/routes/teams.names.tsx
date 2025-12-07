import type { Route } from "./+types/teams.names";
import { db } from "~/database/db";
import { Link } from "react-router";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { TEAM_SIZE } from "~/consts";
import { TeamLogo } from "~/components/TeamLogo";

export async function loader({ request }: Route.LoaderArgs) {
  const allTeams = await db.query.teams.findMany({
    with: {
      players: {
        with: {
          lineup: true,
        },
      },
      captain: true,
    },
    orderBy: (teams, { asc }) => asc(teams.id),
  });

  const teamsWithFullPlayers = allTeams.map((team) => {
    const players = team.players ?? [];
    const sortedPlayers = [...players].sort((a, b) => {
      const aOrder = a.lineup?.battingOrder;
      const bOrder = b.lineup?.battingOrder;
      // Both have batting order - sort by order
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      // One has batting order - that one comes first
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      // Neither has batting order - sort by name
      return a.name.localeCompare(b.name);
    });
    const filledPlayers: ((typeof players)[0] | null)[] = [...sortedPlayers];
    while (filledPlayers.length < TEAM_SIZE) {
      filledPlayers.push(null);
    }
    return { ...team, players: filledPlayers };
  });

  return { teams: teamsWithFullPlayers };
}

export default function TeamsNames({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {loaderData.teams.map((team) => (
          <Link
            to={`/team/${team.id}`}
            className="flex flex-col gap-4 group"
            key={team.id}
          >
            <p className="w-full text-lg font-rodin font-bold text-center">
              {team.name}
            </p>
            <div className="flex flex-col gap-4 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4 w-60 max-w-full transition-colors group-hover:bg-cell-gray/60">
              <TeamLogo
                captainStatsCharacter={
                  team.captain?.statsCharacter ?? undefined
                }
              />
              <TeamPlayerList team={team} size="sm" link={false} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

