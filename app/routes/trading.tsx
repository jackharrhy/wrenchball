import type { Route } from "./+types/trading";
import { database } from "~/database/context";
import { getSeasonState } from "~/utils/admin";
import { getPendingTradesForUser, getTrades } from "~/utils/trading";
import { requireUser } from "~/auth.server";
import { useRevalidator } from "react-router";
import { useStream } from "~/utils/useStream";
import { PlayerIcon } from "~/components/PlayerIcon";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const db = database();
  const seasonState = await getSeasonState(db);

  if (seasonState?.state !== "playing") {
    return {
      error: `Season is in "${seasonState?.state || "unknown"}" state, trading is only available during playing state`,
      user,
      myTeam: null,
      allTeams: [],
      pendingTrades: [],
      tradeHistory: [],
    };
  }

  const myTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.userId, user.id),
    with: {
      players: true,
    },
  });

  if (!myTeam) {
    return {
      error: "You do not have a team",
      user,
      myTeam: null,
      allTeams: [],
      pendingTrades: [],
      tradeHistory: [],
    };
  }

  const allTeams = await db.query.teams.findMany({
    where: (teams, { ne }) => ne(teams.userId, user.id),
    orderBy: (teams, { asc }) => asc(teams.name),
  });

  const pendingTrades = await getPendingTradesForUser(db, user.id);

  const paginatedTrades = await getTrades(db);

  return {
    user,
    myTeam,
    allTeams,
    pendingTrades,
    paginatedTrades,
  };
}

type Trade = Awaited<ReturnType<typeof getTrades>>["trades"][number];
type Player = Trade["tradePlayers"][number]["player"];

const PlayerList = ({ players }: { players: Player[] }) => {
  return (
    <div className="flex items-center gap-3">
      {players.map((player) => (
        <a href={`/player/${player.id}`} key={player.id}>
          <PlayerIcon player={player} size="md" />
        </a>
      ))}
    </div>
  );
};

const Trade = ({ trade }: { trade: Trade }) => {
  return (
    <div className="flex flex-col items-center gap-2 border border-cell-gray/50 rounded-md p-2 bg-cell-gray/40">
      <div className="flex items-center gap-4">
        <PlayerList
          players={trade.tradePlayers.map((tradePlayer) => tradePlayer.player)}
        />
        <a className="hover:underline" href={`/team/${trade.fromTeam.id}`}>
          {trade.fromTeam.name}
        </a>
        <div>&rarr;</div>
        <a className="hover:underline" href={`/team/${trade.toTeam.id}`}>
          {trade.toTeam.name}
        </a>
        <PlayerList
          players={trade.tradePlayers.map((tradePlayer) => tradePlayer.player)}
        />
      </div>
    </div>
  );
};

const TradeList = ({ trades }: { trades: Trade[] }) => {
  return (
    <div className="flex max-w-2xl w-full flex-col gap-3">
      {trades.map((trade) => (
        <Trade key={trade.id} trade={trade} />
      ))}
    </div>
  );
};

export default function Trading({
  loaderData: { error, myTeam, allTeams, pendingTrades, paginatedTrades },
}: Route.ComponentProps) {
  if (error) {
    return <div className="text-center text-gray-200 italic">{error}</div>;
  }

  const revalidator = useRevalidator();

  useStream((data) => {
    console.log("trade-created", data);
    revalidator.revalidate();
  }, "trade-created");

  useStream((data) => {
    console.log("trade-accepted", data);
    revalidator.revalidate();
  }, "trade-accepted");

  useStream((data) => {
    console.log("trade-denied", data);
    revalidator.revalidate();
  }, "trade-denied");

  return (
    <div className="flex flex-col gap-4 items-center">
      <h2 className="text-xl font-bold text-center">Pending Trades</h2>
      {pendingTrades.length === 0 ? (
        <div className="italic text-gray-300 text-center">
          You have no pending trades
        </div>
      ) : (
        <TradeList trades={pendingTrades} />
      )}
      <h2 className="text-xl font-bold text-center">Trade History</h2>
      <TradeList trades={paginatedTrades?.trades ?? []} />
    </div>
  );
}
