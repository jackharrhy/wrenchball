import type { Route } from "./+types/drafting";
import { database } from "~/database/context";
import { getSeasonState, getDraftingOrder } from "~/utils/admin";
import { draftPlayer } from "~/utils/draft";
import { users, players } from "~/database/schema";
import { eq, sql } from "drizzle-orm";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { useState } from "react";
import {
  Form,
  useActionData,
  useNavigation,
  useRevalidator,
} from "react-router";
import { requireUser } from "~/auth.server";
import { broadcast } from "~/sse.server";
import { useStream } from "~/utils/useStream";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const db = database();
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
    orderBy: (players, { asc }) => asc(players.name),
    with: {
      stats: true,
    },
  });

  const draftingOrder = await getDraftingOrder(db);

  // Count total picks made (same logic as advanceToNextDrafter)
  const draftedPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(sql`${players.teamId} IS NOT NULL`);
  const totalPicksMade = draftedPlayers.length;

  return {
    user,
    seasonState: seasonState?.state || null,
    currentDraftingUserName,
    currentDraftingUserId: seasonState?.currentDraftingUserId || null,
    freeAgents,
    draftingOrder,
    totalPicksMade,
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

    const db = database();
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

  return { success: false, error: "Invalid action" };
}

export default function Drafting({
  loaderData: {
    user,
    seasonState,
    currentDraftingUserName,
    currentDraftingUserId,
    freeAgents,
    draftingOrder,
    totalPicksMade,
  },
  actionData,
}: Route.ComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<
    (typeof freeAgents)[0] | null
  >(null);
  const navigation = useNavigation();
  const isDrafting = navigation.formData?.get("intent") === "draft-player";
  const revalidator = useRevalidator();

  useStream((data) => {
    console.log("draft-update", data);
    revalidator.revalidate();
  }, "draft-update");

  if (seasonState !== "drafting") {
    return (
      <div>
        Season is in '{seasonState || "unknown"}' state, not time for drafting
      </div>
    );
  }

  const filteredFreeAgents = freeAgents.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate snake order for the current round (same logic as advanceToNextDrafter)
  const orderedDraftingList = (() => {
    if (draftingOrder.length === 0 || !currentDraftingUserId) {
      return draftingOrder;
    }

    // Calculate which round we're in (0-indexed: 0, 1, 2, ...)
    // Round 0: forward (0, 1, 2, ..., n-1)
    // Round 1: reverse (n-1, n-2, ..., 1, 0)
    // Round 2: forward (0, 1, 2, ..., n-1)
    const roundNumber = Math.floor(totalPicksMade / draftingOrder.length);
    const positionInRound = totalPicksMade % draftingOrder.length;

    // Generate the order for the current round
    let currentRoundOrder: typeof draftingOrder;
    if (roundNumber % 2 === 0) {
      // Forward round: 0, 1, 2, ..., n-1
      currentRoundOrder = [...draftingOrder];
    } else {
      // Reverse round: n-1, n-2, ..., 1, 0
      currentRoundOrder = [...draftingOrder].reverse();
    }

    // Find the current drafter's position in the current round order
    const currentIndexInRound = currentRoundOrder.findIndex(
      (item) => item.userId === currentDraftingUserId
    );

    if (currentIndexInRound === -1) {
      return currentRoundOrder;
    }

    // Show current drafter first, then remaining picks in this round, then next round
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
            {filteredFreeAgents.map((player) => (
              <div
                key={player.id}
                onClick={() => setSelectedPlayer(player)}
                className={`border-1 border-cell-gray/50 rounded-md p-0.75 cursor-pointer transition-all ${
                  selectedPlayer?.id === player.id
                    ? "ring-2 ring-blue-400 border-blue-400"
                    : "hover:border-cell-gray hover:ring-1 hover:ring-cell-gray/50"
                }`}
              >
                <PlayerIcon player={player} size="lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="stats flex flex-col gap-1">
          {selectedPlayer ? (
            <>
              <div className="flex items-center justify-center">
                <div className="border-b-2 border-cell-gray/50">
                  <PlayerIcon player={selectedPlayer} size="xl" />
                </div>
              </div>
              <div className="mt-4">
                <Form method="post">
                  <input type="hidden" name="intent" value="draft-player" />
                  <input
                    type="hidden"
                    name="playerId"
                    value={selectedPlayer.id}
                  />
                  <button
                    type="submit"
                    disabled={isDrafting || currentDraftingUserId !== user.id}
                    className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
                      currentDraftingUserId === user.id && !isDrafting
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-gray-500 opacity-50 cursor-not-allowed text-white"
                    }`}
                  >
                    {isDrafting
                      ? "Drafting..."
                      : `Draft ${selectedPlayer.name}`}
                  </button>
                </Form>
                {actionData?.error && (
                  <div className="mt-2 text-red-400 text-sm">
                    {actionData.error}
                  </div>
                )}
                {actionData?.success && (
                  <div className="mt-2 text-green-400 text-sm">
                    {actionData.message || "Player drafted successfully!"}
                  </div>
                )}
              </div>
              <div className="p-4 overflow-y-auto">
                {selectedPlayer.stats ? (
                  <>
                    <PlayerInfo
                      stats={selectedPlayer.stats}
                      variant="compact"
                    />
                  </>
                ) : (
                  <div className="text-center text-gray-400">
                    No stats available for {selectedPlayer.name}
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
          {draftingOrder.length === 0 ? (
            <div className="px-4 pb-4 text-gray-400 italic">
              No users in drafting order
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-4">
              {orderedDraftingList.map((item) => (
                <div
                  key={item.userId}
                  className={`flex items-center gap-4 border rounded transition-colors ${
                    currentDraftingUserId === item.userId
                      ? "bg-cell-gray/50 border-blue-400 border-2 p-2"
                      : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 text-xs p-1.5"
                  }`}
                >
                  <span className="flex-1 flex items-center gap-2">
                    {currentDraftingUserId === item.userId ? (
                      <>Drafting: {item.userName}</>
                    ) : (
                      <>
                        <span className="opacity-50">Up next:</span>{" "}
                        {item.userName}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
