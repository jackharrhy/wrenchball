import type { Route } from "./+types/trading";
import { db } from "~/database/db";
import { getSeasonState } from "~/utils/admin.server";
import {
  getPendingTradesForUser,
  getTrades,
  acceptTrade,
  denyTrade,
} from "~/utils/trading.server";
import { requireUser } from "~/auth.server";
import { Link, useRevalidator, Form, useActionData } from "react-router";
import { useStream } from "~/utils/useStream";
import { PlayerIcon } from "~/components/PlayerIcon";
import { MentionDisplay } from "~/components/MentionEditor";
import { useState } from "react";
import { cn } from "~/utils/cn";
import { broadcast } from "~/sse.server";
import type { users } from "~/database/schema";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import type { MentionContext } from "~/utils/mentions";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

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
      players: {
        with: {
          lineup: true,
        },
      },
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

  // Collect all proposal and response texts from trades to resolve mentions
  const allTradeTexts = [
    ...pendingTrades.map((t) => t.proposalText),
    ...pendingTrades.map((t) => t.responseText),
    ...(paginatedTrades?.trades ?? []).map((t) => t.proposalText),
    ...(paginatedTrades?.trades ?? []).map((t) => t.responseText),
  ];

  const { mergedContext: mentionContext } = await resolveMentionsMultiple(
    db,
    allTradeTexts,
  );

  return {
    user,
    myTeam,
    allTeams,
    pendingTrades,
    paginatedTrades,
    mentionContext: {
      players: Array.from(mentionContext.players.entries()),
      teams: Array.from(mentionContext.teams.entries()),
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);

  const formData = await request.formData();

  const intent = formData.get("intent");
  const tradeIdStr = formData.get("tradeId");

  if (!intent || (intent !== "accept" && intent !== "deny")) {
    return { success: false, error: "Invalid action" };
  }

  if (!tradeIdStr || typeof tradeIdStr !== "string") {
    return { success: false, error: "Trade ID is required" };
  }

  const tradeId = parseInt(tradeIdStr, 10);
  if (isNaN(tradeId)) {
    return { success: false, error: "Invalid trade ID" };
  }

  if (intent === "accept") {
    const result = await acceptTrade(db, tradeId, user.id);
    if (result.success) {
      broadcast(user, "trading", "trade-accepted", { tradeId });
      return { success: true };
    }
    return { success: false, error: result.error || "Failed to accept trade" };
  } else {
    const result = await denyTrade(db, tradeId, user.id);
    if (result.success) {
      broadcast(user, "trading", "trade-denied", { tradeId });
      return { success: true };
    }
    return { success: false, error: result.error || "Failed to deny trade" };
  }
}

type Trade = Awaited<ReturnType<typeof getTrades>>["trades"][number];
type Player = Trade["tradePlayers"][number]["player"];

const PlayerList = ({
  players,
  captainId,
  align = "left",
}: {
  players: Player[];
  captainId?: number | null;
  align?: "left" | "right";
}) => {
  if (players.length === 0) {
    return (
      <div
        className={cn(
          "w-full italic text-white/40",
          align === "right" ? "text-right" : "text-left",
        )}
      >
        Nothing
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {players.map((player) => {
        const isCaptain =
          captainId !== null &&
          captainId !== undefined &&
          player.id === captainId;
        return (
          <a href={`/player/${player.id}`} key={player.id}>
            <PlayerIcon
              player={player}
              size="lg"
              isStarred={player.lineup?.isStarred ?? false}
              isCaptain={isCaptain}
            />
          </a>
        );
      })}
    </div>
  );
};

const TradeCard = ({
  trade,
  showActions,
  canAccept,
  canDeny,
  isOwnTrade,
  mentionContext,
}: {
  trade: Trade;
  showActions: boolean;
  canAccept: boolean;
  canDeny: boolean;
  isOwnTrade: boolean;
  mentionContext: MentionContext;
}) => {
  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="w-full flex flex-wrap lg:flex-nowrap flex-row justify-center items-center gap-2">
        <div className="hidden lg:block w-24 h-full shrink-0" />
        <div className="hidden lg:block w-24 h-full shrink-0" />
        <div
          className={cn(
            "relative w-full max-w-3xl shrink-0 flex flex-col justify-center items-center gap-2 border rounded-md px-4 py-2 pb-4",
            trade.status === "pending" &&
              "bg-yellow-400/35 border-yellow-400/40",
            trade.status === "accepted" &&
              "bg-green-400/35 border-green-400/40",
            trade.status === "denied" && "bg-red-400/35 border-red-400/40",
            trade.status === "cancelled" &&
              "bg-orange-400/35 border-orange-400/40",
          )}
        >
          <a
            href={`/trade/${trade.id}`}
            className="absolute top-0 left-1.5 text-gray-400 hover:text-white"
            title="View trade"
          >
            ⛶
          </a>
          <p className="absolute top-1 right-1.5 rotate-3 text-sm text-gray-300">
            {trade.status[0].toUpperCase() + trade.status.slice(1)}
          </p>
          <div className="w-full flex flex-col gap-1">
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 text-right">
                <a
                  className="hover:underline"
                  href={`/team/${trade.fromTeam.id}`}
                >
                  {trade.fromTeam.name}
                </a>
              </div>
              <div className="text-2xl font-extrabold shrink-0">↔</div>
              <div className="flex-1 text-left">
                <a
                  className="hover:underline"
                  href={`/team/${trade.toTeam.id}`}
                >
                  {trade.toTeam.name}
                </a>
              </div>
            </div>
            <div className="w-full flex items-start gap-3">
              <div className="flex-1">
                <PlayerList
                  players={trade.tradePlayers
                    .filter(
                      (tradePlayer) => tradePlayer.toTeamId === trade.toTeam.id,
                    )
                    .map((tradePlayer) => tradePlayer.player)}
                  captainId={trade.fromTeam.captainId}
                  align="right"
                />
              </div>
              <div className="w-8 shrink-0" />
              <div className="flex-1">
                <PlayerList
                  players={trade.tradePlayers
                    .filter(
                      (tradePlayer) =>
                        tradePlayer.fromTeamId === trade.toTeam.id,
                    )
                    .map((tradePlayer) => tradePlayer.player)}
                  captainId={trade.toTeam.captainId}
                  align="left"
                />
              </div>
            </div>
          </div>
          {trade.proposalText && (
            <div className="w-full border-t border-gray-500/30 pt-2 mt-1">
              <p className="text-xs text-gray-400 mb-1">
                {trade.responseText
                  ? `Initial message from ${trade.fromTeam.name}:`
                  : `Message from ${trade.fromTeam.name}:`}
              </p>
              <MentionDisplay
                content={trade.proposalText}
                context={mentionContext}
              />
            </div>
          )}
          {trade.responseText && trade.status !== "pending" && (
            <div className="w-full border-t border-gray-500/30 pt-2 mt-1">
              <p className="text-xs text-gray-400 mb-1">
                {trade.status === "cancelled"
                  ? `Cancellation reason from ${trade.fromTeam.name}:`
                  : `Response from ${trade.toTeam.name}:`}
              </p>
              <MentionDisplay
                content={trade.responseText}
                context={mentionContext}
              />
            </div>
          )}
        </div>
        {showActions ? (
          <>
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="accept" />
              <input type="hidden" name="tradeId" value={trade.id} />
              <button
                type="submit"
                className={cn(
                  "w-24 h-auto max-h-12 lg:h-full shrink-0 px-3 py-1 rounded text-white cursor-pointer border border-green-800/50",
                  canAccept
                    ? "bg-green-800/80 hover:bg-green-700/80"
                    : "bg-green-800/60 cursor-not-allowed text-gray-400",
                )}
                disabled={!canAccept}
              >
                Accept
              </button>
            </Form>
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="deny" />
              <input type="hidden" name="tradeId" value={trade.id} />
              <button
                type="submit"
                className={cn(
                  "w-24 h-auto max-h-12 lg:h-full shrink-0 px-3 py-1 rounded text-white cursor-pointer border border-red-800/50",
                  canDeny
                    ? "bg-red-800/80 hover:bg-red-700/80"
                    : "bg-red-800/60 cursor-not-allowed text-gray-400",
                )}
                disabled={!canDeny}
              >
                {isOwnTrade ? "Cancel" : "Deny"}
              </button>
            </Form>
          </>
        ) : (
          <>
            <div className="w-24 shrink-0" />
            <div className="w-24 shrink-0" />
          </>
        )}
      </div>
    </div>
  );
};

const TradeList = ({
  user,
  trades,
  showActions,
  mentionContext,
}: {
  user: typeof users.$inferSelect;
  trades: Trade[];
  showActions: boolean;
  mentionContext: MentionContext;
}) => {
  return (
    <div className="w-full lg:w-auto items-center justify-stretch flex flex-col gap-3">
      {trades.map((trade) => {
        const isOwnTrade = trade.fromUserId === user.id;
        const canAccept =
          trade.toUserId === user.id && trade.status === "pending";
        const canDeny =
          (trade.fromUserId === user.id || trade.toUserId === user.id) &&
          trade.status === "pending";
        return (
          <TradeCard
            key={trade.id}
            trade={trade}
            showActions={showActions}
            canAccept={showActions && canAccept}
            canDeny={showActions && canDeny}
            isOwnTrade={isOwnTrade}
            mentionContext={mentionContext}
          />
        );
      })}
    </div>
  );
};

export default function Trading({
  loaderData: {
    error,
    user,
    myTeam,
    allTeams,
    pendingTrades,
    paginatedTrades,
    mentionContext,
  },
}: Route.ComponentProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const actionData = useActionData<typeof action>();

  // Reconstruct Map from serialized entries
  const context: MentionContext = {
    players: new Map(mentionContext?.players ?? []),
    teams: new Map(mentionContext?.teams ?? []),
  };

  if (error) {
    return <div className="text-center text-gray-200 italic">{error}</div>;
  }

  const revalidator = useRevalidator();

  useStream(
    (data) => {
      console.log("trade-created", data);
      revalidator.revalidate();
    },
    "trade-created",
    "trading",
  );

  useStream(
    (data) => {
      console.log("trade-accepted", data);
      revalidator.revalidate();
    },
    "trade-accepted",
    "trading",
  );

  useStream(
    (data) => {
      console.log("trade-denied", data);
      revalidator.revalidate();
    },
    "trade-denied",
    "trading",
  );

  return (
    <div className="flex flex-col gap-6 items-center">
      {actionData?.error && (
        <div className="text-red-400 text-center bg-red-900/20 border border-red-500/50 rounded-md p-3">
          {actionData.error}
        </div>
      )}
      <div className="flex items-center gap-2 border border-cell-gray/50 rounded-md px-4 p-2 bg-cell-gray/40">
        <span>Trade with:</span>
        <select
          className="rounded p-2 border border-cell-gray/50 bg-cell-gray/20 text-white"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
        >
          <option value="" disabled>
            Select a player...
          </option>
          {allTeams
            .filter((team) => myTeam?.id !== team.id)
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </select>
        {selectedTeamId ? (
          <Link
            to={`/trade/with/${selectedTeamId}`}
            className="ml-2 px-3 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white"
          >
            Trade
          </Link>
        ) : (
          <span className="ml-2 px-3 py-1 rounded bg-gray-600/30 text-gray-400 cursor-not-allowed">
            Trade
          </span>
        )}
      </div>
      <h2 className="text-xl font-bold text-center">Pending Trades</h2>
      {pendingTrades.length === 0 ? (
        <div className="italic text-gray-300 text-center">
          You have no pending trades
        </div>
      ) : (
        <TradeList
          user={user}
          trades={pendingTrades}
          showActions={true}
          mentionContext={context}
        />
      )}
      <h2 className="text-xl font-bold text-center">Trade History</h2>
      {paginatedTrades?.trades?.length === 0 ? (
        <div className="italic text-gray-300 text-center">
          No trades have been made yet
        </div>
      ) : (
        <TradeList
          user={user}
          trades={paginatedTrades?.trades ?? []}
          showActions={false}
          mentionContext={context}
        />
      )}
    </div>
  );
}
