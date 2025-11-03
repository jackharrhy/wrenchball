import type { Route } from "./+types/drafting";
import { database } from "~/database/context";
import { getSeasonState, getDraftingOrder } from "~/utils/admin";
import { users } from "~/database/schema";
import { eq } from "drizzle-orm";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { useState } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const db = database();
  const seasonState = await getSeasonState(db);

  let currentDraftingUserName: string | null = null;
  if (seasonState?.state === "drafting" && seasonState.currentDraftingUserId) {
    const user = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, seasonState.currentDraftingUserId))
      .limit(1);

    if (user.length > 0) {
      currentDraftingUserName = user[0].name;
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

  return {
    seasonState: seasonState?.state || null,
    currentDraftingUserName,
    currentDraftingUserId: seasonState?.currentDraftingUserId || null,
    freeAgents,
    draftingOrder,
  };
}

export default function Drafting({
  loaderData: {
    seasonState,
    currentDraftingUserName,
    currentDraftingUserId,
    freeAgents,
    draftingOrder,
  },
}: Route.ComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<
    (typeof freeAgents)[0] | null
  >(null);

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

  const orderedDraftingList = (() => {
    if (draftingOrder.length === 0 || !currentDraftingUserId) {
      return draftingOrder;
    }

    const currentIndex = draftingOrder.findIndex(
      (item) => item.userId === currentDraftingUserId
    );

    if (currentIndex === -1) {
      return draftingOrder;
    }

    return [
      ...draftingOrder.slice(currentIndex),
      ...draftingOrder.slice(0, currentIndex),
    ];
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
        <div className="stats">
          {selectedPlayer ? (
            <div className="p-4">
              {selectedPlayer.stats ? (
                <p>Info about {selectedPlayer.name}</p>
              ) : (
                <div className="text-center text-gray-400">
                  No stats available for {selectedPlayer.name}
                </div>
              )}
            </div>
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
