import type { Route } from "./+types/drafting";
import { db } from "~/database/db";
import { getSeasonState, getDraftingOrder } from "~/utils/admin.server";
import {
  draftPlayer,
  getPreDraft,
  setPreDraft,
  clearPreDraft,
} from "~/utils/draft.server";
import { users, players } from "~/database/schema";
import { eq, sql } from "drizzle-orm";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { useState, useRef } from "react";
import { Form, useNavigation, useRevalidator, useSubmit } from "react-router";
import { requireUser } from "~/auth.server";
import { broadcast } from "~/sse.server";
import { useStream } from "~/utils/useStream";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  const seasonState = await getSeasonState(db);

  let currentDraftingUserName: string | null = null;
  if (seasonState?.state === "drafting" && seasonState.currentDraftingUserId) {
    const draftingUser = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, seasonState.currentDraftingUserId))
      .limit(1);

    if (draftingUser.length > 0) {
      currentDraftingUserName = draftingUser[0].name;
    }
  }

  const freeAgents = await db.query.players.findMany({
    where: (players, { isNull }) => isNull(players.teamId),
    orderBy: (players, { asc }) => asc(players.sortPosition),
    with: {
      stats: true,
    },
  });

  const draftingOrder = await getDraftingOrder(db);

  const draftedPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(sql`${players.teamId} IS NOT NULL`);
  const totalPicksMade = draftedPlayers.length;

  // Get pre-draft selection for current user
  const preDraftPlayerId = await getPreDraft(db, user.id);
  let preDraftPlayer = null;
  if (preDraftPlayerId) {
    const playerData = await db.query.players.findFirst({
      where: eq(players.id, preDraftPlayerId),
      with: {
        stats: true,
      },
    });
    preDraftPlayer = playerData || null;
  }

  return {
    user,
    seasonState: seasonState?.state || null,
    currentDraftingUserName,
    currentDraftingUserId: seasonState?.currentDraftingUserId || null,
    freeAgents,
    draftingOrder,
    totalPicksMade,
    preDraftPlayer,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "draft-player") {
    const playerIdStr = formData.get("playerId");
    if (!playerIdStr) {
      return { success: false, error: "Player ID is required" };
    }

    const playerId = parseInt(playerIdStr as string, 10);
    if (isNaN(playerId)) {
      return { success: false, error: "Invalid player ID" };
    }

    const result = await draftPlayer(db, user.id, playerId);

    if (result.success) {
      broadcast(user, "draft-update", { playerId, userId: user.id });
      return { success: true, message: "Player drafted successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to draft player",
      };
    }
  }

  if (intent === "drafting-player-hover") {
    const playerIdStr = formData.get("playerId");
    if (!playerIdStr) {
      return { success: false, error: "Player ID is required" };
    }

    const playerId = parseInt(playerIdStr as string, 10);
    if (isNaN(playerId)) {
      return { success: false, error: "Invalid player ID" };
    }

    const seasonState = await getSeasonState(db);

    if (
      seasonState?.state === "drafting" &&
      seasonState.currentDraftingUserId === user.id
    ) {
      broadcast(user, "drafting-player-hover", {
        playerId,
        userId: user.id,
      });
    }

    return { success: true };
  }

  if (intent === "drafting-player-selection") {
    const playerIdStr = formData.get("playerId");
    if (!playerIdStr) {
      return { success: false, error: "Player ID is required" };
    }

    const playerId = parseInt(playerIdStr as string, 10);
    if (isNaN(playerId)) {
      return { success: false, error: "Invalid player ID" };
    }

    const seasonState = await getSeasonState(db);

    if (
      seasonState?.state === "drafting" &&
      seasonState.currentDraftingUserId === user.id
    ) {
      broadcast(user, "drafting-player-selection", {
        playerId,
        userId: user.id,
      });
    }

    return { success: true };
  }

  if (intent === "set-pre-draft") {
    const playerIdStr = formData.get("playerId");
    if (!playerIdStr) {
      return { success: false, error: "Player ID is required" };
    }

    const playerId = parseInt(playerIdStr as string, 10);
    if (isNaN(playerId)) {
      return { success: false, error: "Invalid player ID" };
    }

    const result = await setPreDraft(db, user.id, playerId);

    if (result.success) {
      broadcast(user, "pre-draft-update", { playerId, userId: user.id });
      return { success: true, message: "Pre-draft set successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to set pre-draft",
      };
    }
  }

  if (intent === "clear-pre-draft") {
    const result = await clearPreDraft(db, user.id);

    if (result.success) {
      broadcast(user, "pre-draft-update", { playerId: null, userId: user.id });
      return { success: true, message: "Pre-draft cleared successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to clear pre-draft",
      };
    }
  }

  return { success: false, error: "Invalid action" };
}

export default function Drafting({
  loaderData: {
    user,
    seasonState,
    currentDraftingUserId,
    freeAgents,
    draftingOrder,
    totalPicksMade,
    preDraftPlayer,
  },
  actionData,
}: Route.ComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<
    (typeof freeAgents)[0] | null
  >(null);
  const [localHoverPlayer, setLocalHoverPlayer] = useState<
    (typeof freeAgents)[0] | null
  >(null);
  const [otherPlayerHover, setOtherPlayerHover] = useState<{
    playerId: number;
    userName: string;
  } | null>(null);
  const [otherPlayerSelection, setOtherPlayerSelection] = useState<{
    playerId: number;
    userName: string;
  } | null>(null);
  const navigation = useNavigation();
  const submit = useSubmit();
  const isDrafting = navigation.formData?.get("intent") === "draft-player";
  const revalidator = useRevalidator();
  const isActiveDrafter = currentDraftingUserId === user.id;

  const prevDraftingUserIdRef = useRef(currentDraftingUserId);

  useStream((data) => {
    console.log("draft-update", data);

    // Track turn changes and clear UI state when turn changes
    if (prevDraftingUserIdRef.current !== currentDraftingUserId) {
      if (currentDraftingUserId !== user.id) {
        setOtherPlayerHover(null);
        setOtherPlayerSelection(null);
      }
      prevDraftingUserIdRef.current = currentDraftingUserId;
    }

    revalidator.revalidate();
  }, "draft-update");

  useStream((data) => {
    console.log("pre-draft-update", data);
    revalidator.revalidate();
  }, "pre-draft-update");

  useStream((data) => {
    console.log("drafting-player-hover", data);
    if (data.user.id !== user.id && currentDraftingUserId === data.user.id) {
      setOtherPlayerHover({
        playerId: data.payload.playerId,
        userName: data.user.name,
      });
    } else {
      setOtherPlayerHover(null);
    }
  }, "drafting-player-hover");

  useStream((data) => {
    console.log("drafting-player-selection", data);
    if (data.user.id !== user.id && currentDraftingUserId === data.user.id) {
      setOtherPlayerSelection({
        playerId: data.payload.playerId,
        userName: data.user.name,
      });
    } else {
      setOtherPlayerSelection(null);
    }
  }, "drafting-player-selection");

  if (seasonState !== "drafting") {
    return (
      <div>
        Season is in '{seasonState || "unknown"}' state, not time for drafting
      </div>
    );
  }

  const filteredFreeAgents = freeAgents.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const orderedDraftingList = (() => {
    if (draftingOrder.length === 0 || !currentDraftingUserId) {
      return draftingOrder;
    }

    const roundNumber = Math.floor(totalPicksMade / draftingOrder.length);

    let currentRoundOrder: typeof draftingOrder;
    if (roundNumber % 2 === 0) {
      currentRoundOrder = [...draftingOrder];
    } else {
      currentRoundOrder = [...draftingOrder].reverse();
    }

    const currentIndexInRound = currentRoundOrder.findIndex(
      (item) => item.userId === currentDraftingUserId,
    );

    if (currentIndexInRound === -1) {
      return currentRoundOrder;
    }

    const remainingInRound = currentRoundOrder.slice(currentIndexInRound);
    const nextRoundNumber = roundNumber + 1;
    const nextRoundOrder =
      nextRoundNumber % 2 === 0
        ? [...draftingOrder]
        : [...draftingOrder].reverse();

    return [...remainingInRound, ...nextRoundOrder];
  })();

  return (
    <>
      <div className="drafting-container">
        <div className="search flex flex-col gap-2 items-center justify-center pr-3">
          <input
            name="search"
            type="text"
            placeholder="Search players"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-cell-gray/50 outline-none focus:ring-1 ring-cell-gray/70 rounded-md p-2 bg-transparent"
          />
        </div>
        <div className="free-agents">
          {freeAgents.length === 0 && (
            <div className="text-lg italic opacity-90 px-4 py-1">
              All players have been drafted!
            </div>
          )}
          <div className="flex flex-wrap gap-2 p-4">
            {filteredFreeAgents.map((player) => {
              const isSelected = selectedPlayer?.id === player.id;
              const isOtherPlayerHover =
                otherPlayerHover?.playerId === player.id;
              const isOtherPlayerSelection =
                otherPlayerSelection?.playerId === player.id;
              const isPreDrafted = preDraftPlayer?.id === player.id;
              return (
                <div key={player.id} className="relative">
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (selectedPlayer?.id === player.id) {
                        setSelectedPlayer(null);
                        setLocalHoverPlayer(null);
                        e.preventDefault();
                        return;
                      }

                      setSelectedPlayer(player);
                      setLocalHoverPlayer(null);

                      if (!isActiveDrafter) {
                        e.preventDefault();
                        return;
                      }
                    }}
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value="drafting-player-selection"
                    />
                    <input type="hidden" name="playerId" value={player.id} />
                    <button
                      type="submit"
                      onMouseEnter={() => {
                        setLocalHoverPlayer(player);
                        if (isActiveDrafter) {
                          submit(
                            {
                              intent: "drafting-player-hover",
                              playerId: player.id.toString(),
                            },
                            { method: "post" },
                          );
                        }
                      }}
                      className={`border-1 border-cell-gray/50 rounded-md p-0.75 cursor-pointer transition-all w-full ${
                        isSelected
                          ? "ring-2 ring-blue-400 border-blue-400"
                          : isPreDrafted
                            ? "ring-2 ring-blue-300 border-blue-300"
                            : isOtherPlayerSelection
                              ? "ring-2 ring-yellow-400 border-yellow-400"
                              : isOtherPlayerHover
                                ? "ring-2 ring-yellow-400/40 border-yellow-400/40"
                                : "hover:border-cell-gray hover:ring-1 hover:ring-cell-gray/50"
                      }`}
                    >
                      <PlayerIcon player={player} size="lg" />
                    </button>
                  </Form>
                  {isOtherPlayerSelection && (
                    <div className="absolute -top-1 -right-1 bg-yellow-400 text-black text-xs px-1 rounded text-[10px] font-semibold">
                      {otherPlayerSelection.userName}
                    </div>
                  )}
                  {!isOtherPlayerSelection && isPreDrafted && (
                    <div className="absolute -top-1 -right-1 bg-blue-400 text-white text-xs px-1 rounded text-[10px] font-semibold">
                      Pre-Draft
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="stats flex flex-col gap-1 border-b border-cell-gray/50">
          {selectedPlayer || localHoverPlayer ? (
            <>
              <div className="flex items-center justify-center">
                <div className="border-b-2 border-cell-gray/50">
                  <PlayerIcon
                    player={selectedPlayer || localHoverPlayer!}
                    size="xl"
                  />
                </div>
              </div>
              {selectedPlayer && (
                <div className="mt-4 flex flex-col gap-2">
                  {currentDraftingUserId === user.id ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="draft-player" />
                      <input
                        type="hidden"
                        name="playerId"
                        value={selectedPlayer.id}
                      />
                      <button
                        type="submit"
                        disabled={isDrafting}
                        className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
                          !isDrafting
                            ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                            : "bg-gray-500 opacity-50 cursor-not-allowed text-white"
                        }`}
                      >
                        {isDrafting
                          ? "Drafting..."
                          : `Draft ${selectedPlayer.name}`}
                      </button>
                    </Form>
                  ) : (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="set-pre-draft"
                      />
                      <input
                        type="hidden"
                        name="playerId"
                        value={selectedPlayer.id}
                      />
                      <button
                        type="submit"
                        disabled={preDraftPlayer?.id === selectedPlayer.id}
                        className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
                          preDraftPlayer?.id === selectedPlayer.id
                            ? "bg-gray-500 opacity-50 cursor-not-allowed text-white"
                            : "bg-blue-800 hover:bg-blue-900 text-white cursor-pointer"
                        }`}
                      >
                        {preDraftPlayer?.id === selectedPlayer.id
                          ? "Pre-Drafted"
                          : `Pre-Draft ${selectedPlayer.name}`}
                      </button>
                    </Form>
                  )}
                  {actionData?.error && (
                    <div className="mt-2 text-red-400 text-sm">
                      {actionData.error}
                    </div>
                  )}
                  {actionData?.success && actionData.message && (
                    <div className="mt-2 text-green-400 text-sm">
                      {actionData.message}
                    </div>
                  )}
                </div>
              )}
              <div className="p-4 overflow-y-auto">
                {(selectedPlayer || localHoverPlayer)?.stats ? (
                  <>
                    <PlayerInfo
                      stats={(selectedPlayer || localHoverPlayer)!.stats!}
                      variant="compact"
                    />
                  </>
                ) : (
                  <div className="text-center text-gray-400">
                    No stats available for{" "}
                    {(selectedPlayer || localHoverPlayer)!.name}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-gray-400 italic">
              Click on a player to view their stats
            </div>
          )}
        </div>
        <div className="drafting">
          {preDraftPlayer && (
            <div className="px-4 pb-4 border-b border-cell-gray/50 mb-4">
              <h3 className="text-sm font-semibold mb-2 text-gray-300">
                Your Pre-Draft
              </h3>
              <div className="bg-cell-gray/40 border border-blue-400/50 rounded p-2 flex items-center gap-2">
                <div className="flex-shrink-0">
                  <PlayerIcon player={preDraftPlayer} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {preDraftPlayer.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    Will auto-draft on your turn
                  </div>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="clear-pre-draft" />
                  <button
                    type="submit"
                    className="flex-shrink-0 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </Form>
              </div>
            </div>
          )}
          {draftingOrder.length === 0 ? (
            <div className="px-4 pb-4 text-gray-400 italic">
              No users in drafting order
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-4">
              {orderedDraftingList.map((item, index) => {
                const isCurrentDrafter =
                  currentDraftingUserId === item.userId &&
                  orderedDraftingList.findIndex(
                    (i) => i.userId === currentDraftingUserId,
                  ) === index;
                return (
                  <div
                    key={`${item.userId}-${index}`}
                    className={`flex items-center gap-4 border rounded transition-colors ${
                      isCurrentDrafter
                        ? "bg-cell-gray/50 border-blue-400 border-2 p-2"
                        : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 text-xs p-1.5"
                    }`}
                  >
                    <span className="flex-1 flex items-center gap-2">
                      {isCurrentDrafter ? (
                        <>Drafting: {item.userName}</>
                      ) : (
                        <>
                          <span className="opacity-50">Up next:</span>{" "}
                          {item.userName}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
