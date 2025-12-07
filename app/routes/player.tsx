import type { Route } from "./+types/player";
import { db } from "~/database/db";
import {
  eventDraft,
  eventTrade,
  tradePlayers,
  eventMatchStateChange,
  matchBattingOrders,
  events,
} from "~/database/schema";
import { PlayerIcon } from "~/components/PlayerIcon";
import { PlayerInfo } from "~/components/PlayerInfo";
import { cn } from "~/utils/cn";
import { Link } from "react-router";
import { desc, eq, inArray, and } from "drizzle-orm";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import { Events } from "~/components/Events";

export async function loader({ params: { playerId } }: Route.LoaderArgs) {
  const playerIdNum = Number(playerId);

  const player = await db.query.players.findFirst({
    where: (players, { eq }) => eq(players.id, playerIdNum),
    with: {
      team: true,
      lineup: true,
      stats: true,
    },
  });

  if (!player) {
    throw new Response("Player not found", { status: 404 });
  }

  // Get event IDs for draft events involving this player
  const draftEventIds = await db
    .select({ eventId: eventDraft.eventId })
    .from(eventDraft)
    .where(eq(eventDraft.playerId, playerIdNum));

  // Get trade IDs where this player is involved
  const playerTradeIds = await db
    .select({ tradeId: tradePlayers.tradeId })
    .from(tradePlayers)
    .where(eq(tradePlayers.playerId, playerIdNum));

  // Get event IDs for trade events
  const tradeEventIds =
    playerTradeIds.length > 0
      ? await db
          .select({ eventId: eventTrade.eventId })
          .from(eventTrade)
          .where(
            inArray(
              eventTrade.tradeId,
              playerTradeIds.map((t) => t.tradeId),
            ),
          )
      : [];

  // Get match IDs where this player participates
  const playerMatchIds = await db
    .select({ matchId: matchBattingOrders.matchId })
    .from(matchBattingOrders)
    .where(eq(matchBattingOrders.playerId, playerIdNum));

  // Get event IDs for match state change events (finished only)
  const matchEventIds =
    playerMatchIds.length > 0
      ? await db
          .select({ eventId: eventMatchStateChange.eventId })
          .from(eventMatchStateChange)
          .where(
            and(
              inArray(
                eventMatchStateChange.matchId,
                playerMatchIds.map((m) => m.matchId),
              ),
              eq(eventMatchStateChange.toState, "finished"),
            ),
          )
      : [];

  // Combine all event IDs
  const allEventIds = [
    ...draftEventIds.map((e) => e.eventId),
    ...tradeEventIds.map((e) => e.eventId),
    ...matchEventIds.map((e) => e.eventId),
  ];

  // Query all events with full relations
  const playerEvents =
    allEventIds.length > 0
      ? await db.query.events.findMany({
          where: (events, { inArray }) => inArray(events.id, allEventIds),
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
            trade: {
              with: {
                trade: {
                  with: {
                    fromTeam: true,
                    toTeam: true,
                    tradePlayers: {
                      with: {
                        player: true,
                      },
                    },
                  },
                },
              },
            },
            matchStateChange: {
              with: {
                match: {
                  with: {
                    teamA: true,
                    teamB: true,
                  },
                },
              },
            },
          },
          orderBy: [desc(events.createdAt)],
        })
      : [];

  // Resolve mentions for trade texts
  const tradeProposalTexts = playerEvents
    .filter((e) => e.trade?.trade?.proposalText)
    .map((e) => e.trade!.trade!.proposalText);

  const tradeResponseTexts = playerEvents
    .filter((e) => e.trade?.trade?.responseText)
    .map((e) => e.trade!.trade!.responseText);

  const { mergedContext } = await resolveMentionsMultiple(db, [
    ...tradeProposalTexts,
    ...tradeResponseTexts,
  ]);

  return {
    player,
    events: playerEvents,
    mentionContext: {
      players: Array.from(mergedContext.players.entries()),
      teams: Array.from(mergedContext.teams.entries()),
    },
  };
}

export default function Player({ loaderData }: Route.ComponentProps) {
  const {
    player: { stats, ...player },
    events: playerEvents,
    mentionContext: mentionContextData,
  } = loaderData;

  const mentionContext = {
    players: new Map(mentionContextData.players),
    teams: new Map(mentionContextData.teams),
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-rodin font-bold">{player.name}</h1>

      <div className="flex flex-col items-center gap-6 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-8">
        <PlayerIcon
          player={player}
          size="xl"
          isStarred={player.lineup?.isStarred ?? false}
          isCaptain={
            player.team?.captainId !== null &&
            player.team?.captainId !== undefined &&
            player.id === player.team.captainId
          }
        />

        <div className="text-center space-y-2">
          <p>
            Team:{" "}
            {player.team ? (
              <Link to={`/team/${player.team.id}`} className="hover:underline">
                {player.team.name}
              </Link>
            ) : (
              <span className={cn("text-green-400 font-semibold")}>
                Free Agent
              </span>
            )}
          </p>
        </div>

        {stats && <PlayerInfo stats={stats} />}
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-4">Player History</h2>
        <Events events={playerEvents} mentionContext={mentionContext} />
      </div>
    </div>
  );
}
