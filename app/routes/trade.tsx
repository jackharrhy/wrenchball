import type { Route } from "./+types/trade";
import { db } from "~/database/db";
import { getTradeById, acceptTrade, denyTrade } from "~/utils/trading.server";
import { getUser } from "~/auth.server";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { useState } from "react";
import { PlayerIcon } from "~/components/PlayerIcon";
import { MentionEditor, MentionDisplay } from "~/components/MentionEditor";
import { cn } from "~/utils/cn";
import { broadcast } from "~/sse.server";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import type { MentionContext } from "~/utils/mentions";
import {
  teams as teamsTable,
  players as playersTable,
} from "~/database/schema";
import { formatTimeAgo } from "~/utils/time";

export async function loader({
  params: { tradeId },
  request,
}: Route.LoaderArgs) {
  const tradeIdNum = Number(tradeId);
  if (isNaN(tradeIdNum)) {
    throw new Response("Invalid trade ID", { status: 400 });
  }

  const trade = await getTradeById(db, tradeIdNum);

  if (!trade) {
    throw new Response("Trade not found", { status: 404 });
  }

  const user = await getUser(request);

  // Determine user's relationship to the trade
  const isFromUser = user?.id === trade.fromUserId;
  const isToUser = user?.id === trade.toUserId;
  const isParticipant = isFromUser || isToUser;
  const isPending = trade.status === "pending";

  const canAccept = isToUser && isPending;
  const canDeny = isParticipant && isPending;

  // Resolve mentions from proposal and response text
  const { mergedContext: mentionContext } = await resolveMentionsMultiple(db, [
    trade.proposalText,
    trade.responseText,
  ]);

  // Fetch all teams and players for mention suggestions (only if user can act)
  let allTeams: { id: number; name: string }[] = [];
  let allPlayers: { id: number; name: string }[] = [];

  if (canAccept || canDeny) {
    allTeams = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable);
    allPlayers = await db
      .select({ id: playersTable.id, name: playersTable.name })
      .from(playersTable);
  }

  return {
    trade,
    user,
    isFromUser,
    isToUser,
    canAccept,
    canDeny,
    allTeams,
    allPlayers,
    mentionContext: {
      players: Array.from(mentionContext.players.entries()),
      teams: Array.from(mentionContext.teams.entries()),
    },
  };
}

export async function action({
  params: { tradeId },
  request,
}: Route.ActionArgs) {
  const user = await getUser(request);

  if (!user) {
    return {
      success: false,
      error: "You must be logged in to perform this action",
    };
  }

  const tradeIdNum = Number(tradeId);
  if (isNaN(tradeIdNum)) {
    return { success: false, error: "Invalid trade ID" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const responseText = formData.get("responseText");

  if (!intent || (intent !== "accept" && intent !== "deny")) {
    return { success: false, error: "Invalid action" };
  }

  const responseTextStr =
    typeof responseText === "string" && responseText.trim()
      ? responseText
      : undefined;

  if (intent === "accept") {
    const result = await acceptTrade(db, tradeIdNum, user.id, responseTextStr);
    if (result.success) {
      broadcast(user, "trading", "trade-accepted", { tradeId: tradeIdNum });
      return redirect(`/trade/${tradeId}`);
    }
    return { success: false, error: result.error || "Failed to accept trade" };
  } else {
    const result = await denyTrade(db, tradeIdNum, user.id, responseTextStr);
    if (result.success) {
      broadcast(user, "trading", "trade-denied", { tradeId: tradeIdNum });
      return redirect(`/trade/${tradeId}`);
    }
    return { success: false, error: result.error || "Failed to deny trade" };
  }
}

type Trade = NonNullable<Awaited<ReturnType<typeof getTradeById>>>;
type Player = Trade["tradePlayers"][number]["player"];

const PlayerList = ({
  players,
  captainId,
}: {
  players: Player[];
  captainId?: number | null;
}) => {
  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
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

export default function TradePage({
  loaderData: {
    trade,
    user,
    isFromUser,
    isToUser,
    canAccept,
    canDeny,
    allTeams,
    allPlayers,
    mentionContext,
  },
}: Route.ComponentProps) {
  const [responseText, setResponseText] = useState("");
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Reconstruct Map from serialized entries
  const context: MentionContext = {
    players: new Map(mentionContext?.players ?? []),
    teams: new Map(mentionContext?.teams ?? []),
  };

  const fromPlayers = trade.tradePlayers
    .filter((tp) => tp.toTeamId === trade.toTeam.id)
    .map((tp) => tp.player);

  const toPlayers = trade.tradePlayers
    .filter((tp) => tp.fromTeamId === trade.toTeam.id)
    .map((tp) => tp.player);

  const statusColors = {
    pending: "bg-yellow-400/35 border-yellow-400/40",
    accepted: "bg-green-400/35 border-green-400/40",
    denied: "bg-red-400/35 border-red-400/40",
    cancelled: "bg-orange-400/35 border-orange-400/40",
  };

  const statusLabels = {
    pending: "Pending",
    accepted: "Accepted",
    denied: "Denied",
    cancelled: "Cancelled",
  };

  return (
    <div className="flex flex-col gap-6 items-center max-w-full w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Trade Details</h1>

      {actionData?.error && (
        <div className="text-red-400 text-center bg-red-900/20 border border-red-500/50 rounded-md p-3 w-full">
          {actionData.error}
        </div>
      )}

      <div
        className={cn(
          "w-full border rounded-lg p-6",
          statusColors[trade.status],
        )}
      >
        {/* Status Badge */}
        <div className="flex justify-between items-start mb-4">
          <span
            className={cn(
              "px-3 py-1 rounded-full text-sm font-semibold",
              trade.status === "pending" && "bg-yellow-500/50 text-yellow-100",
              trade.status === "accepted" && "bg-green-500/50 text-green-100",
              trade.status === "denied" && "bg-red-500/50 text-red-100",
              trade.status === "cancelled" &&
                "bg-orange-500/50 text-orange-100",
            )}
          >
            {statusLabels[trade.status]}
          </span>
          <span className="text-sm text-gray-400">
            {formatTimeAgo(new Date(trade.createdAt))}
          </span>
        </div>

        {/* Trade Details */}
        <div className="flex flex-col gap-6">
          {/* From Team */}
          <div className="flex flex-col gap-3 items-center">
            <a
              href={`/team/${trade.fromTeam.id}`}
              className="text-lg font-bold hover:underline text-green-300"
            >
              {trade.fromTeam.name}
            </a>
            <span className="text-sm text-gray-400">offers</span>
            {fromPlayers.length > 0 ? (
              <PlayerList
                players={fromPlayers}
                captainId={trade.fromTeam.captainId}
              />
            ) : (
              <span className="text-gray-400 italic">No players</span>
            )}
          </div>

          {/* Exchange Arrow */}
          <div className="flex justify-center">
            <div className="text-3xl font-bold text-gray-400">⇅</div>
          </div>

          {/* To Team */}
          <div className="flex flex-col gap-3 items-center">
            <a
              href={`/team/${trade.toTeam.id}`}
              className="text-lg font-bold hover:underline text-green-300"
            >
              {trade.toTeam.name}
            </a>
            <span className="text-sm text-gray-400">offers</span>
            {toPlayers.length > 0 ? (
              <PlayerList
                players={toPlayers}
                captainId={trade.toTeam.captainId}
              />
            ) : (
              <span className="text-gray-400 italic">No players</span>
            )}
          </div>
        </div>

        {/* Proposal Message */}
        {trade.proposalText && (
          <div className="mt-6 border-t border-gray-500/30 pt-4">
            <p className="text-sm text-gray-400 mb-2">
              Message from {trade.fromTeam.name}:
            </p>
            <div className="bg-cell-gray/30 rounded-md p-3">
              <MentionDisplay content={trade.proposalText} context={context} />
            </div>
          </div>
        )}

        {/* Response Message (if trade is completed) */}
        {trade.responseText && trade.status !== "pending" && (
          <div className="mt-4 border-t border-gray-500/30 pt-4">
            <p className="text-sm text-gray-400 mb-2">
              {trade.status === "cancelled"
                ? `Cancellation reason from ${trade.fromTeam.name}:`
                : `Response from ${trade.toTeam.name}:`}
            </p>
            <div className="bg-cell-gray/30 rounded-md p-3">
              <MentionDisplay content={trade.responseText} context={context} />
            </div>
          </div>
        )}
      </div>

      {/* Action Section (only for participants on pending trades) */}
      {(canAccept || canDeny) && (
        <div className="w-full border border-cell-gray/50 bg-cell-gray/30 rounded-lg p-4">
          <h2 className="text-lg font-bold mb-4">
            {isFromUser ? "Cancel Trade" : "Respond to Trade"}
          </h2>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">
                Response Message (optional):
              </label>
              <MentionEditor
                content={responseText}
                onChange={setResponseText}
                placeholder={
                  isFromUser
                    ? "Add a reason for cancelling..."
                    : "Add a response to this trade..."
                }
                teams={allTeams}
                players={allPlayers}
              />
              <p className="text-xs text-gray-400">
                Type @ to mention teams or players
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              {canAccept && (
                <Form method="post">
                  <input type="hidden" name="intent" value="accept" />
                  <input
                    type="hidden"
                    name="responseText"
                    value={responseText}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      "px-6 py-2 rounded-md font-semibold text-white cursor-pointer border border-green-800/50",
                      isSubmitting
                        ? "bg-green-800/60 cursor-not-allowed"
                        : "bg-green-800/80 hover:bg-green-700/80",
                    )}
                  >
                    {isSubmitting ? "Processing..." : "Accept Trade"}
                  </button>
                </Form>
              )}
              {canDeny && (
                <Form method="post">
                  <input type="hidden" name="intent" value="deny" />
                  <input
                    type="hidden"
                    name="responseText"
                    value={responseText}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                      "px-6 py-2 rounded-md font-semibold text-white cursor-pointer border border-red-800/50",
                      isSubmitting
                        ? "bg-red-800/60 cursor-not-allowed"
                        : "bg-red-800/80 hover:bg-red-700/80",
                    )}
                  >
                    {isSubmitting
                      ? "Processing..."
                      : isFromUser
                        ? "Cancel Trade"
                        : "Deny Trade"}
                  </button>
                </Form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <a
        href="/trading"
        className="text-sm text-gray-400 hover:text-gray-200 underline"
      >
        ← Back to Trading
      </a>
    </div>
  );
}
