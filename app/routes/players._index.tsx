import { PlayerIcon } from "~/components/PlayerIcon";
import type { Route } from "./+types/players._index";
import { db } from "~/database/db";
import { cn } from "~/utils/cn";
import { Link } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  const allPlayers = await db.query.players.findMany({
    with: {
      team: true,
    },
    orderBy: (players, { asc }) => asc(players.sortPosition),
  });

  return { players: allPlayers };
}

export default function PlayersIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {loaderData.players.map((player) => (
        <Link
          key={player.id}
          to={`/player/${player.id}`}
          className="relative flex flex-col items-center gap-2 p-4 border-2 border-cell-gray/50 rounded-lg w-36 h-23 bg-cell-gray/40 hover:bg-cell-gray/60 transition-colors"
        >
          <PlayerIcon player={player} />
          <span className="text-xs text-center">{player.name}</span>
          <span
            className={cn(
              "text-xs absolute top-1 right-1.5 opacity-50 rotate-8",
              player.team?.abbreviation ? "" : "text-green-300",
            )}
          >
            {player.team?.abbreviation ?? "Free"}
          </span>
        </Link>
      ))}
    </div>
  );
}
