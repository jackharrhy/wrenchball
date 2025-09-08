import type { Route } from "./+types/player";
import { database } from "~/database/context";
import { PlayerIcon } from "~/components/PlayerIcon";
import { cn } from "~/utils/cn";
import { Link } from "react-router";

export async function loader({ params: { playerId } }: Route.LoaderArgs) {
  const db = database();

  const player = await db.query.players.findFirst({
    where: (players, { eq }) => eq(players.id, Number(playerId)),
    with: {
      team: true,
      lineup: true,
    },
  });

  if (!player) {
    throw new Response("Player not found", { status: 404 });
  }

  return { player };
}

export default function Player({
  loaderData: { player },
}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-rodin font-bold">{player.name}</h1>

      <div className="flex flex-col items-center gap-6 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-8 w-80">
        <PlayerIcon player={player} size="xl" />

        <div className="text-center space-y-2">
          <p>
            Team:{" "}
            {player.team ? (
              <Link to={`/team/${player.team.id}`}>{player.team.name}</Link>
            ) : (
              <span className={cn("text-green-600 font-semibold")}>
                Free Agent
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
