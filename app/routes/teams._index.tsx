import type { Route } from "./+types/teams._index";
import { db } from "~/database/db";
import { Link } from "react-router";
import { Lineup } from "~/components/Lineup";
import { PlayerIcon } from "~/components/PlayerIcon";
import { TEAM_SIZE } from "~/consts";

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

export default function TeamsLineups({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {loaderData.teams.map((team) => {
          const allPlayers = team.players.filter(
            (player): player is NonNullable<typeof player> => player !== null,
          );

          const benchPlayers = allPlayers
            .filter((player) => player.lineup?.battingOrder == null)
            .sort((a, b) => a.name.localeCompare(b.name));

          return (
            <Link
              to={`/team/${team.id}`}
              className="flex flex-col gap-4 group"
              key={team.id}
            >
              <p className="w-full text-lg font-rodin font-bold text-center">
                {team.name}
              </p>
              <div className="flex flex-col items-center gap-4 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4 transition-colors group-hover:bg-cell-gray/60">
                <Lineup
                  players={allPlayers}
                  captainId={team.captainId}
                  captainStatsCharacter={team.captain?.statsCharacter}
                />
                {benchPlayers.length > 0 && (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="w-full border-t border-cell-gray/30" />
                    <div className="flex items-end gap-1">
                      <span className="text-sm opacity-60">Bench:</span>
                      {benchPlayers.map((player) => (
                        <PlayerIcon key={player.id} player={player} size="md" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

