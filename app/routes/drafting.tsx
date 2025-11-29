import type { Route } from "./+types/drafting";
import { db } from "~/database/db";
import {
  getSeasonState,
  getDraftingOrder,
  getDraftTimerState,
  pauseDraftTimer,
  resumeDraftTimer,
  resetDraftTimer,
} from "~/utils/admin.server";
import {
  draftPlayer,
  getPreDraft,
  setPreDraft,
  clearPreDraft,
  setPlayerStarred,
} from "~/utils/draft.server";
import { users, players, type Player, events } from "~/database/schema";
import { desc, eq, sql } from "drizzle-orm";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { useState, useRef, useEffect } from "react";
import { Form, useNavigation, useRevalidator, useSubmit } from "react-router";
import { requireUser } from "~/auth.server";
import { broadcast } from "~/sse.server";
import { useStream } from "~/utils/useStream";
import { TEAM_SIZE } from "~/consts";
import { Events } from "~/components/Events";
import { formatTeamName } from "~/utils/formatTeamName";

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

  const allTeams = await db.query.teams.findMany({
    with: {
      players: {
        with: {
          lineup: true,
        },
      },
    },
    orderBy: (teams, { asc }) => asc(teams.id),
  });

  const teamsWithFullPlayers = allTeams.map((team) => {
    const players = team.players ?? [];
    const filledPlayers: ((typeof players)[0] | null)[] = [...players];
    while (filledPlayers.length < TEAM_SIZE) {
      filledPlayers.push(null);
    }
    return { ...team, players: filledPlayers };
  });

  const draftEvents = await db.query.events.findMany({
    with: {
      user: true,
      draft: {
        with: {
          player: {
            with: {
              lineup: true,
            },
          },
          team: true,
        },
      },
    },
    where: (events, { eq }) => eq(events.eventType, "draft"),
    orderBy: [desc(events.createdAt)],
  });

  // Check if user's team has a captain
  const userTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.userId, user.id),
  });
  const hasCaptain =
    userTeam?.captainId !== null && userTeam?.captainId !== undefined;

  // Get timer state
  const timerState = await getDraftTimerState(db);

  return {
    user,
    seasonState: seasonState?.state || null,
    currentDraftingUserName,
    currentDraftingUserId: seasonState?.currentDraftingUserId || null,
    freeAgents,
    draftingOrder,
    totalPicksMade,
    preDraftPlayer,
    allTeams: teamsWithFullPlayers,
    draftEvents,
    hasCaptain,
    timerState,
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
      broadcast(user, "drafting", "draft-update", {
        playerId,
        userId: user.id,
      });
      // Broadcast timer update after draft (timer resets in draftPlayer)
      const timerState = await getDraftTimerState(db);
      broadcast(user, "drafting", "draft-timer-update", timerState);
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
      broadcast(user, "drafting", "drafting-player-hover", {
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
      broadcast(user, "drafting", "drafting-player-selection", {
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
      broadcast(user, "drafting", "pre-draft-update", {
        playerId,
        userId: user.id,
      });
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
      broadcast(user, "drafting", "pre-draft-update", {
        playerId: null,
        userId: user.id,
      });
      return { success: true, message: "Pre-draft cleared successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to clear pre-draft",
      };
    }
  }

  if (intent === "set-player-starred") {
    const playerIdStr = formData.get("playerId");
    if (!playerIdStr) {
      return { success: false, error: "Player ID is required" };
    }

    const playerId = parseInt(playerIdStr as string, 10);
    if (isNaN(playerId)) {
      return { success: false, error: "Invalid player ID" };
    }

    const result = await setPlayerStarred(db, user.id, playerId);

    if (result.success) {
      broadcast(user, "drafting", "player-star-update", {
        playerId,
        userId: user.id,
      });
      return { success: true, message: "Player starred successfully" };
    } else {
      return {
        success: false,
        error: result.error || "Failed to star player",
      };
    }
  }

  if (intent === "pause-timer") {
    if (user.role !== "admin") {
      return { success: false, error: "Only admins can pause the timer" };
    }

    try {
      await pauseDraftTimer(db);
      const timerState = await getDraftTimerState(db);
      broadcast(user, "drafting", "draft-timer-update", timerState);
      return { success: true, message: "Timer paused" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to pause timer",
      };
    }
  }

  if (intent === "resume-timer") {
    if (user.role !== "admin") {
      return { success: false, error: "Only admins can resume the timer" };
    }

    try {
      await resumeDraftTimer(db);
      const timerState = await getDraftTimerState(db);
      broadcast(user, "drafting", "draft-timer-update", timerState);
      return { success: true, message: "Timer resumed" };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to resume timer",
      };
    }
  }

  if (intent === "reset-timer") {
    if (user.role !== "admin") {
      return { success: false, error: "Only admins can reset the timer" };
    }

    try {
      await resetDraftTimer(db);
      const timerState = await getDraftTimerState(db);
      broadcast(user, "drafting", "draft-timer-update", timerState);
      return { success: true, message: "Timer reset" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset timer",
      };
    }
  }

  return { success: false, error: `Invalid action: ${intent}` };
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
    allTeams,
    draftEvents,
    hasCaptain,
    timerState,
  },
  actionData,
}: Route.ComponentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<
    (typeof freeAgents)[0] | null
  >(null);
  const [isLuckySelected, setIsLuckySelected] = useState(false);
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
  const [localTimerState, setLocalTimerState] = useState(timerState);
  const navigation = useNavigation();
  const submit = useSubmit();
  const isDrafting = navigation.formData?.get("intent") === "draft-player";
  const revalidator = useRevalidator();
  const isActiveDrafter = currentDraftingUserId === user.id;
  const isAdmin = user.role === "admin";

  const prevDraftingUserIdRef = useRef(currentDraftingUserId);
  const prevActionDataRef = useRef(actionData);
  const [showActionData, setShowActionData] = useState(false);

  // Show actionData for 3 seconds when it changes
  useEffect(() => {
    // Check if actionData has changed
    if (actionData !== prevActionDataRef.current) {
      prevActionDataRef.current = actionData;

      // Only show if there's actual content (success message or error)
      if (actionData && (actionData.message || actionData.error)) {
        setShowActionData(true);

        const timeoutId = window.setTimeout(() => {
          setShowActionData(false);
        }, 3000);

        return () => {
          clearTimeout(timeoutId);
        };
      } else {
        setShowActionData(false);
      }
    }
  }, [actionData]);

  // While we have socket events for MOST things, some things will
  // not trigger any of the useStream hooks, so lets revalidate
  // every 5 seconds with a 2s jitter.
  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleRevalidate = () => {
      // 2s jitter (random between 0 and 2000ms)
      const jitter = Math.random() * 2000;
      timeoutId = window.setTimeout(() => {
        revalidator.revalidate();
        scheduleRevalidate();
      }, 5000 + jitter);
    };

    scheduleRevalidate();

    return () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [revalidator]);

  useStream(
    (data) => {
      console.log("draft-update", data);

      // Track turn changes and clear UI state when turn changes
      if (prevDraftingUserIdRef.current !== currentDraftingUserId) {
        if (currentDraftingUserId !== user.id) {
          setOtherPlayerHover(null);
          setOtherPlayerSelection(null);
        }
        prevDraftingUserIdRef.current = currentDraftingUserId;
      }

      // Clear lucky selection when draft completes
      setIsLuckySelected(false);
      setSelectedPlayer(null);

      revalidator.revalidate();
    },
    "draft-update",
    "drafting",
  );

  useStream(
    (data) => {
      console.log("pre-draft-update", data);
      revalidator.revalidate();
    },
    "pre-draft-update",
    "drafting",
  );

  useStream(
    (data) => {
      console.log("drafting-player-hover", data);
      if (data.user.id !== user.id && currentDraftingUserId === data.user.id) {
        setOtherPlayerHover({
          playerId: data.payload.playerId,
          userName: data.user.name,
        });
      } else {
        setOtherPlayerHover(null);
      }
    },
    "drafting-player-hover",
    "drafting",
  );

  useStream(
    (data) => {
      console.log("drafting-player-selection", data);
      if (data.user.id !== user.id && currentDraftingUserId === data.user.id) {
        setOtherPlayerSelection({
          playerId: data.payload.playerId,
          userName: data.user.name,
        });
      } else {
        setOtherPlayerSelection(null);
      }
    },
    "drafting-player-selection",
    "drafting",
  );

  useStream(
    (data) => {
      console.log("player-star-update", data);
      revalidator.revalidate();
    },
    "player-star-update",
    "drafting",
  );

  useStream(
    (data) => {
      console.log("draft-timer-update", data);
      setLocalTimerState(data.payload);
    },
    "draft-timer-update",
    "drafting",
  );

  // Update local timer state when loader data changes
  useEffect(() => {
    setLocalTimerState(timerState);
  }, [timerState]);

  // Client-side countdown timer
  useEffect(() => {
    if (!localTimerState.startedAt || localTimerState.isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setLocalTimerState((prev) => {
        if (!prev.startedAt || prev.isPaused) {
          return prev;
        }
        const remaining = Math.max(0, prev.remainingSeconds - 1);
        return { ...prev, remainingSeconds: remaining };
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [localTimerState.startedAt, localTimerState.isPaused]);

  // Format timer display
  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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
        <div className="free-agents overflow-y-auto border-b border-cell-gray/50">
          {freeAgents.length === 0 && (
            <div className="text-lg italic opacity-90 px-4 py-1">
              All players have been drafted!
            </div>
          )}
          <div className="flex flex-wrap gap-2 p-4">
            {/* Lucky slot */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsLuckySelected(true);
                  setSelectedPlayer(null);
                  setLocalHoverPlayer(null);
                }}
                className={`border-1 border-cell-gray/50 rounded-md p-0.75 cursor-pointer transition-all w-full ${
                  isLuckySelected
                    ? "ring-2 ring-blue-400 border-blue-400"
                    : "hover:border-cell-gray hover:ring-1 hover:ring-cell-gray/50"
                }`}
              >
                <PlayerIcon player={null} size="lg" isQuestionMark={true} />
              </button>
            </div>
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
                        setIsLuckySelected(false);
                        e.preventDefault();
                        return;
                      }

                      setSelectedPlayer(player);
                      setLocalHoverPlayer(null);
                      setIsLuckySelected(false);

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

        <div className="teams">
          <div className="flex flex-col gap-2 p-4">
            {allTeams.map((team) => {
              const isUserTeam = team.userId === user.id;
              const canToggleStar = isUserTeam && seasonState === "drafting";
              return (
                <div
                  key={team.id}
                  className="flex flex-wrap gap-2 items-center border border-cell-gray/50 bg-cell-gray/40 rounded-md px-4 py-1.5"
                >
                  <p className="text-sm font-semibold w-32 mr-2 truncate" title={formatTeamName(team)}>{formatTeamName(team)}</p>
                  {team.players.slice(0, TEAM_SIZE - 3).map((player, index) => {
                    const isStarred = player?.lineup?.isStarred ?? false;
                    const isCaptain =
                      team.captainId !== null &&
                      team.captainId !== undefined &&
                      player?.id === team.captainId;
                    return (
                      <div
                        key={player?.id || index}
                        className={`relative flex ${player ? "" : "opacity-50"}`}
                      >
                        {player ? (
                          canToggleStar ? (
                            <Form method="post" className="flex">
                              <input
                                type="hidden"
                                name="intent"
                                value="set-player-starred"
                              />
                              <input
                                type="hidden"
                                name="playerId"
                                value={player.id}
                              />
                              <button
                                type="submit"
                                className="relative cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <PlayerIcon
                                  player={player}
                                  size="lg"
                                  isStarred={isStarred}
                                  isCaptain={isCaptain}
                                />
                              </button>
                            </Form>
                          ) : (
                            <a href={`/player/${player.id}`}>
                              <PlayerIcon
                                player={player}
                                size="lg"
                                isStarred={isStarred}
                                isCaptain={isCaptain}
                              />
                            </a>
                          )
                        ) : (
                          <PlayerIcon player={null} size="lg" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="stats flex flex-col gap-1 border-b border-cell-gray/50">
          {seasonState === "drafting" && localTimerState.startedAt && (
            <div className="timer-section flex flex-col gap-2 items-center justify-center p-4 border-b border-cell-gray/50">
              <div
                className={`text-3xl font-bold ${
                  localTimerState.isPaused
                    ? "text-yellow-400"
                    : localTimerState.remainingSeconds < 30
                      ? "text-red-400"
                      : localTimerState.remainingSeconds < 60
                        ? "text-orange-400"
                        : "text-green-400"
                }`}
              >
                {formatTimer(localTimerState.remainingSeconds)}
              </div>
              {localTimerState.isPaused && (
                <div className="text-sm text-yellow-400 italic">Paused</div>
              )}
              {isAdmin && (
                <div className="flex gap-2 mt-2">
                  {localTimerState.isPaused ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="resume-timer" />
                      <button
                        type="submit"
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors cursor-pointer"
                      >
                        Resume
                      </button>
                    </Form>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="pause-timer" />
                      <button
                        type="submit"
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm transition-colors cursor-pointer"
                      >
                        Pause
                      </button>
                    </Form>
                  )}
                  <Form method="post">
                    <input type="hidden" name="intent" value="reset-timer" />
                    <button
                      type="submit"
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </Form>
                </div>
              )}
            </div>
          )}

          {isLuckySelected ? (
            <>
              <div className="flex items-center justify-center">
                <div className="border-b-2 border-cell-gray/50">
                  <PlayerIcon player={null} size="xl" isQuestionMark={true} />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {currentDraftingUserId === user.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (freeAgents.length === 0 || isDrafting) {
                        return;
                      }
                      const randomIndex = Math.floor(
                        Math.random() * freeAgents.length,
                      );
                      const randomPlayer = freeAgents[randomIndex];
                      submit(
                        {
                          intent: "draft-player",
                          playerId: randomPlayer.id.toString(),
                        },
                        { method: "post" },
                      );
                      setIsLuckySelected(false);
                    }}
                    disabled={isDrafting || freeAgents.length === 0}
                    className={`w-full px-4 py-2 rounded font-semibold transition-colors ${
                      !isDrafting && freeAgents.length > 0
                        ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                        : "bg-gray-500 opacity-50 cursor-not-allowed text-white"
                    }`}
                  >
                    {isDrafting
                      ? "Drafting..."
                      : freeAgents.length === 0
                        ? "No free agents"
                        : "I'm feeling lucky"}
                  </button>
                ) : (
                  <div className="text-center text-gray-400 text-sm">
                    You can't pre draft randomly!
                  </div>
                )}
                {showActionData && actionData?.error && (
                  <div className="mt-2 text-red-400 text-sm">
                    {actionData.error}
                  </div>
                )}
                {showActionData &&
                  actionData?.success &&
                  actionData.message && (
                    <div className="mt-2 text-green-400 text-sm">
                      {actionData.message}
                    </div>
                  )}
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="text-center text-gray-400">
                  Randomly draft a free agent
                </div>
              </div>
            </>
          ) : selectedPlayer || localHoverPlayer ? (
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
                  {!hasCaptain &&
                    isActiveDrafter &&
                    selectedPlayer.stats?.captain === true && (
                      <div className="text-center text-yellow-400 text-sm font-semibold mb-1">
                        Drafting your team captain
                      </div>
                    )}
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
                          : !hasCaptain &&
                              selectedPlayer.stats?.captain === true
                            ? `Draft ${selectedPlayer.name} as Captain`
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
          {showActionData &&
            (actionData?.error ||
              (actionData?.success && actionData.message)) && (
              <div className="flex flex-col items-center justify-center pb-2">
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
        </div>
        <div className="drafting flex flex-col gap-2 overflow-y-auto border-b border-cell-gray/50">
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
        <div className="events overflow-y-auto border-b border-cell-gray/50 max-h-[40rem]">
          <Events events={draftEvents} />
        </div>
      </div>
    </>
  );
}
