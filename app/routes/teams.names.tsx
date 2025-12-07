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
      conference: true,
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

  // Group teams by conference
  const teamsByConference = new Map<
    number | null,
    {
      conference: { id: number; name: string; color: string | null } | null;
      teams: typeof teamsWithFullPlayers;
    }
  >();

  for (const team of teamsWithFullPlayers) {
    const confId = team.conferenceId;
    if (!teamsByConference.has(confId)) {
      teamsByConference.set(confId, {
        conference: team.conference,
        teams: [],
      });
    }
    teamsByConference.get(confId)!.teams.push(team);
  }

  // Convert to array and sort (conferences first by name, then no conference)
  const groupedTeams = Array.from(teamsByConference.values()).sort((a, b) => {
    if (a.conference === null && b.conference === null) return 0;
    if (a.conference === null) return 1;
    if (b.conference === null) return -1;
    return a.conference.name.localeCompare(b.conference.name);
  });

  return { groupedTeams };
}

export default function TeamsNames({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8">
      {loaderData.groupedTeams.map((group) => (
        <div
          key={group.conference?.id ?? "no-conference"}
          className="w-full flex flex-col gap-4 p-4 rounded-lg border-4"
          style={{
            borderColor: group.conference?.color
              ? `${group.conference.color}80`
              : "rgba(255,255,255,0.2)",
          }}
        >
          <h2
            className="text-xl font-rodin font-bold text-center"
            style={
              group.conference?.color
                ? { color: group.conference.color }
                : undefined
            }
          >
            {group.conference?.name ?? "No Conference"}
          </h2>
          <div className="flex flex-wrap justify-center gap-8">
            {group.teams.map((team) => (
              <Link
                to={`/team/${team.id}`}
                className="flex flex-col items-center justify-center gap-4 group"
                key={team.id}
              >
                <p className="w-full text-lg font-rodin font-bold text-center">
                  {team.name}
                </p>
                <div className="flex flex-col items-center justify-center gap-4 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4 w-60 max-w-full transition-colors group-hover:bg-cell-gray/60">
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
      ))}
    </div>
  );
}
