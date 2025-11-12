import type { Route } from "./+types/trading";
import { database } from "~/database/context";
import { getSeasonState } from "~/utils/admin";
import {
  createTradeRequest,
  acceptTrade,
  denyTrade,
  getTradesForUser,
  getPendingTradesForUser,
} from "~/utils/trading";
import { requireUser } from "~/auth.server";
import { broadcast } from "~/sse.server";
import { teams, players } from "~/database/schema";
import { eq } from "drizzle-orm";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { useState } from "react";
import { Form, useNavigation, useRevalidator, useSubmit } from "react-router";
import { useStream } from "~/utils/useStream";

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

  // Get user's team and players
  const myTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.userId, user.id),
    with: {
      players: {
        with: {
          stats: true,
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

  // Get all teams (for selecting trade partner)
  const allTeams = await db.query.teams.findMany({
    where: (teams, { ne }) => ne(teams.userId, user.id),
    with: {
      players: {
        with: {
          stats: true,
        },
      },
    },
    orderBy: (teams, { asc }) => asc(teams.name),
  });

  // Get pending incoming trades
  const pendingTrades = await getPendingTradesForUser(db, user.id);

  // Get trade history
  const tradeHistory = await getTradesForUser(db, user.id);

  return {
    user,
    myTeam,
    allTeams,
    pendingTrades,
    tradeHistory,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-trade") {
    const toUserIdStr = formData.get("toUserId");
    const fromPlayerIdsStr = formData.get("fromPlayerIds");
    const toPlayerIdsStr = formData.get("toPlayerIds");

    if (!toUserIdStr) {
      return { success: false, error: "Recipient user ID is required" };
    }

    const toUserId = parseInt(toUserIdStr as string, 10);
    if (isNaN(toUserId)) {
      return { success: false, error: "Invalid recipient user ID" };
    }

    const fromPlayerIds: number[] = fromPlayerIdsStr
      ? JSON.parse(fromPlayerIdsStr as string)
      : [];
    const toPlayerIds: number[] = toPlayerIdsStr
      ? JSON.parse(toPlayerIdsStr as string)
      : [];

    if (fromPlayerIds.length === 0 && toPlayerIds.length === 0) {
      return { success: false, error: "Must trade at least one player" };
    }

    const db = database();
    const result = await createTradeRequest(db, {
      fromUserId: user.id,
      toUserId,
      fromPlayerIds,
      toPlayerIds,
    });

    if (result.success) {
      broadcast(user, "trade-created", {
        tradeId: result.tradeId,
        fromUserId: user.id,
        toUserId,
      });
      return { success: true, message: "Trade request created successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to create trade request",
      };
    }
  }

  if (intent === "accept-trade") {
    const tradeIdStr = formData.get("tradeId");
    if (!tradeIdStr) {
      return { success: false, error: "Trade ID is required" };
    }

    const tradeId = parseInt(tradeIdStr as string, 10);
    if (isNaN(tradeId)) {
      return { success: false, error: "Invalid trade ID" };
    }

    const db = database();
    const result = await acceptTrade(db, tradeId, user.id);

    if (result.success) {
      broadcast(user, "trade-accepted", { tradeId, userId: user.id });
      return { success: true, message: "Trade accepted successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to accept trade",
      };
    }
  }

  if (intent === "deny-trade") {
    const tradeIdStr = formData.get("tradeId");
    if (!tradeIdStr) {
      return { success: false, error: "Trade ID is required" };
    }

    const tradeId = parseInt(tradeIdStr as string, 10);
    if (isNaN(tradeId)) {
      return { success: false, error: "Invalid trade ID" };
    }

    const db = database();
    const result = await denyTrade(db, tradeId, user.id);

    if (result.success) {
      broadcast(user, "trade-denied", { tradeId, userId: user.id });
      return { success: true, message: "Trade denied successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to deny trade",
      };
    }
  }

  return { success: false, error: "Invalid action" };
}

export default function Trading({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  if (loaderData.error) {
    return (
      <div className="text-center text-gray-200 italic">{loaderData.error}</div>
    );
  }

  const { myTeam, allTeams, pendingTrades, tradeHistory, user } = loaderData;
  const [selectedFromPlayers, setSelectedFromPlayers] = useState<number[]>([]);
  const [selectedToPlayers, setSelectedToPlayers] = useState<number[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    allTeams.length > 0 ? allTeams[0].id : null
  );
  const [selectedPlayer, setSelectedPlayer] = useState<
    (typeof myTeam.players)[0] | null
  >(null);
  const [hoverPlayer, setHoverPlayer] = useState<
    (typeof myTeam.players)[0] | null
  >(null);
  const navigation = useNavigation();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const isSubmitting = navigation.formData?.get("intent") === "create-trade";

  const selectedTeam = allTeams.find((t) => t.id === selectedTeamId);

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

  const toggleFromPlayer = (playerId: number) => {
    setSelectedFromPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const toggleToPlayer = (playerId: number) => {
    setSelectedToPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleCreateTrade = () => {
    if (!selectedTeam) return;
    submit(
      {
        intent: "create-trade",
        toUserId: selectedTeam.userId.toString(),
        fromPlayerIds: JSON.stringify(selectedFromPlayers),
        toPlayerIds: JSON.stringify(selectedToPlayers),
      },
      { method: "post" }
    );
    setSelectedFromPlayers([]);
    setSelectedToPlayers([]);
  };

  return (
    <div className="trading-container">
      <div className="my-team border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        <h2 className="text-xl font-bold mb-4 px-4 pt-4">
          {myTeam.name} (Your Team)
        </h2>
        <div className="flex flex-wrap gap-2 p-4 overflow-y-auto">
          {myTeam.players.map((player) => {
            if (!player) return null;
            const isSelected = selectedFromPlayers.includes(player.id);
            return (
              <div key={player.id} className="relative">
                <button
                  type="button"
                  onClick={() => toggleFromPlayer(player.id)}
                  onMouseEnter={() => setHoverPlayer(player)}
                  onMouseLeave={() => setHoverPlayer(null)}
                  className={`border-1 border-cell-gray/50 rounded-md p-0.75 cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-blue-400 border-blue-400"
                      : "hover:border-cell-gray hover:ring-1 hover:ring-cell-gray/50"
                  }`}
                >
                  <PlayerIcon player={player} size="lg" />
                </button>
                {isSelected && (
                  <div className="absolute -top-1 -right-1 bg-blue-400 text-black text-xs px-1 rounded text-[10px] font-semibold">
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="other-team border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        <div className="mb-4 px-4 pt-4">
          <label className="block text-xl font-bold mb-2">Trade With:</label>
          <select
            value={selectedTeamId || ""}
            onChange={(e) => {
              setSelectedTeamId(parseInt(e.target.value, 10));
              setSelectedToPlayers([]);
            }}
            className="w-full border border-cell-gray/50 outline-none focus:ring-1 ring-cell-gray/70 rounded-md p-2 bg-transparent"
          >
            {allTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        {selectedTeam && (
          <div className="flex flex-wrap gap-2 p-4 overflow-y-auto">
            {selectedTeam.players.map((player) => {
              if (!player) return null;
              const isSelected = selectedToPlayers.includes(player.id);
              return (
                <div key={player.id} className="relative">
                  <button
                    type="button"
                    onClick={() => toggleToPlayer(player.id)}
                    onMouseEnter={() => setHoverPlayer(player)}
                    onMouseLeave={() => setHoverPlayer(null)}
                    className={`border-1 border-cell-gray/50 rounded-md p-0.75 cursor-pointer transition-all ${
                      isSelected
                        ? "ring-2 ring-green-400 border-green-400"
                        : "hover:border-cell-gray hover:ring-1 hover:ring-cell-gray/50"
                    }`}
                  >
                    <PlayerIcon player={player} size="lg" />
                  </button>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 bg-green-400 text-black text-xs px-1 rounded text-[10px] font-semibold">
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="trade-preview border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        <h2 className="text-xl font-bold mb-4 px-4 pt-4">Trade Preview</h2>
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">You Give:</h3>
            <div className="flex flex-wrap gap-2">
              {selectedFromPlayers.map((playerId) => {
                const player = myTeam.players.find((p) => p?.id === playerId);
                if (!player) return null;
                return (
                  <div key={playerId}>
                    <PlayerIcon player={player} size="md" />
                  </div>
                );
              })}
              {selectedFromPlayers.length === 0 && (
                <span className="text-gray-400 italic text-sm">
                  No players selected
                </span>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">You Receive:</h3>
            <div className="flex flex-wrap gap-2">
              {selectedToPlayers.map((playerId) => {
                const player = selectedTeam?.players.find(
                  (p) => p?.id === playerId
                );
                if (!player) return null;
                return (
                  <div key={playerId}>
                    <PlayerIcon player={player} size="md" />
                  </div>
                );
              })}
              {selectedToPlayers.length === 0 && (
                <span className="text-gray-400 italic text-sm">
                  No players selected
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateTrade}
            disabled={
              isSubmitting ||
              (selectedFromPlayers.length === 0 &&
                selectedToPlayers.length === 0) ||
              !selectedTeam
            }
            className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
              (selectedFromPlayers.length > 0 ||
                selectedToPlayers.length > 0) &&
              !isSubmitting &&
              selectedTeam
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-500 opacity-50 cursor-not-allowed text-white"
            }`}
          >
            {isSubmitting ? "Creating Trade..." : "Create Trade Request"}
          </button>
          {actionData?.error && (
            <div className="text-red-400 text-sm">{actionData.error}</div>
          )}
          {actionData?.success && actionData.message && (
            <div className="text-green-400 text-sm">{actionData.message}</div>
          )}
        </div>
      </div>

      <div className="stats border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        {selectedPlayer || hoverPlayer ? (
          <>
            <div className="flex items-center justify-center p-4">
              <div className="border-b-2 border-cell-gray/50">
                <PlayerIcon player={selectedPlayer || hoverPlayer!} size="xl" />
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              {(selectedPlayer || hoverPlayer)?.stats ? (
                <PlayerInfo
                  stats={(selectedPlayer || hoverPlayer)!.stats!}
                  variant="compact"
                />
              ) : (
                <div className="text-center text-gray-400">
                  No stats available for {(selectedPlayer || hoverPlayer)!.name}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-4 text-center text-gray-400 italic">
            Hover over a player to view their stats
          </div>
        )}
      </div>

      <div className="pending-trades border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        <h2 className="text-xl font-bold mb-4 px-4 pt-4">
          Incoming Trade Requests
        </h2>
        {pendingTrades.length === 0 ? (
          <div className="px-4 pb-4 text-gray-400 italic">
            No pending trade requests
          </div>
        ) : (
          <div className="space-y-2 px-4 pb-4 overflow-y-auto">
            {pendingTrades.map((trade) => (
              <TradeRequestCard
                key={trade.id}
                trade={trade}
                isRecipient={true}
                currentUserId={user.id}
              />
            ))}
          </div>
        )}
      </div>

      <div className="trade-history border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg">
        <h2 className="text-xl font-bold mb-4 px-4 pt-4">Trade History</h2>
        {tradeHistory.length === 0 ? (
          <div className="px-4 pb-4 text-gray-400 italic">No trade history</div>
        ) : (
          <div className="space-y-2 px-4 pb-4 overflow-y-auto">
            {tradeHistory.map((trade) => (
              <TradeRequestCard
                key={trade.id}
                trade={trade}
                isRecipient={false}
                currentUserId={user.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TradeRequestCard({
  trade,
  isRecipient,
  currentUserId,
}: {
  trade: any;
  isRecipient: boolean;
  currentUserId: number;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const isProcessing =
    navigation.formData?.get("intent") === "accept-trade" ||
    navigation.formData?.get("intent") === "deny-trade";

  // Get the teams involved
  const fromTeamId = trade.tradePlayers[0]?.tradePlayer.fromTeamId;
  const toTeamId = trade.tradePlayers[0]?.tradePlayer.toTeamId;

  // Players going FROM the fromUser's team TO the toUser's team
  const fromPlayers = trade.tradePlayers.filter(
    (tp: any) => tp.tradePlayer.fromTeamId === fromTeamId
  );
  // Players going FROM the toUser's team TO the fromUser's team
  const toPlayers = trade.tradePlayers.filter(
    (tp: any) => tp.tradePlayer.fromTeamId === toTeamId
  );

  const isFromMe = trade.fromUserId === currentUserId;
  const statusColors = {
    pending: "bg-yellow-600",
    accepted: "bg-green-600",
    denied: "bg-red-600",
  };

  return (
    <div className="border border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">
          {isFromMe ? (
            <>You → {trade.toUser.name}</>
          ) : (
            <>{trade.fromUser.name} → You</>
          )}
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${
            statusColors[trade.status as keyof typeof statusColors] ||
            "bg-gray-600"
          }`}
        >
          {trade.status.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div>
          <div className="text-xs text-gray-400 mb-1">
            {isFromMe ? "You Give" : `${trade.fromUser.name} Gives`}
          </div>
          <div className="flex flex-wrap gap-1">
            {fromPlayers.map((tp: any) => (
              <PlayerIcon key={tp.player.id} player={tp.player} size="sm" />
            ))}
            {fromPlayers.length === 0 && (
              <span className="text-xs text-gray-400 italic">Nothing</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">
            {isFromMe ? "You Receive" : `You Give`}
          </div>
          <div className="flex flex-wrap gap-1">
            {toPlayers.map((tp: any) => (
              <PlayerIcon key={tp.player.id} player={tp.player} size="sm" />
            ))}
            {toPlayers.length === 0 && (
              <span className="text-xs text-gray-400 italic">Nothing</span>
            )}
          </div>
        </div>
      </div>
      {trade.status === "pending" && isRecipient && !isFromMe && (
        <div className="flex gap-2 mt-2">
          <Form method="post">
            <input type="hidden" name="intent" value="accept-trade" />
            <input type="hidden" name="tradeId" value={trade.id} />
            <button
              type="submit"
              disabled={isProcessing}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
            >
              Accept
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="deny-trade" />
            <input type="hidden" name="tradeId" value={trade.id} />
            <button
              type="submit"
              disabled={isProcessing}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-50"
            >
              Deny
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
