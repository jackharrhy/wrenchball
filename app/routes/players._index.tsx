import type { Route } from "./+types/players._index";
import { db } from "~/database/db";
import { getLeaderboardData } from "~/utils/leaderboard.server";
import { LeaderboardTable } from "~/components/LeaderboardTable";

export async function loader({ request }: Route.LoaderArgs) {
  const players = await getLeaderboardData(db);
  return { players };
}

export default function PlayersLeaderboard({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="space-y-4 h-full flex flex-col">
      <LeaderboardTable players={loaderData.players} />
    </div>
  );
}
