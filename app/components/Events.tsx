import type { Event } from "~/database/schema";
import { PlayerIcon } from "~/components/PlayerIcon";
import {
  renderMentionedText,
  type MentionContext,
  createEmptyContext,
} from "~/utils/mentions";
import { formatTimeAgo } from "~/utils/time";

type EventWithRelations = Event & {
  user?: { id: number; name: string } | null;
  draft?: {
    playerId: number;
    teamId: number;
    pickNumber: number;
    player: {
      id: number;
      name: string;
      imageUrl: string | null;
      statsCharacter: string | null;
      lineup?: { isStarred: boolean } | null;
    };
    team: {
      id: number;
      name: string;
      abbreviation: string;
      captainId: number | null;
    };
  } | null;
  seasonStateChange?: {
    fromState: string | null;
    toState: string;
  } | null;
  trade?: {
    tradeId: number;
    action: "proposed" | "accepted" | "rejected" | "cancelled";
    trade: {
      id: number;
      proposalText: string | null;
      responseText: string | null;
      fromTeam: { id: number; name: string; abbreviation: string };
      toTeam: { id: number; name: string; abbreviation: string };
      tradePlayers: Array<{
        playerId: number;
        fromTeamId: number;
        toTeamId: number;
        player: { id: number; name: string; imageUrl: string | null };
      }>;
    };
  } | null;
  tradePreferencesUpdate?: {
    teamId: number;
    lookingFor?: string | null;
    willingToTrade?: string | null;
    team: {
      id: number;
      name: string;
      abbreviation: string;
    };
  } | null;
};

interface EventsProps {
  events: EventWithRelations[];
  mentionContext?: MentionContext;
}

export function Events({ events, mentionContext }: EventsProps) {
  const context = mentionContext ?? createEmptyContext();

  if (events.length === 0) {
    return (
      <div className="text-center text-gray-400 italic py-8">No events yet</div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        if (event.eventType === "draft" && event.draft) {
          return (
            <div
              key={event.id}
              className="flex items-center gap-3 p-3 bg-cell-gray/40 border border-cell-gray/50 rounded-lg"
            >
              <div className="shrink-0">
                <PlayerIcon
                  player={event.draft.player}
                  size="sm"
                  isStarred={event.draft.player.lineup?.isStarred ?? false}
                  isCaptain={
                    event.draft.team.captainId !== null &&
                    event.draft.team.captainId !== undefined &&
                    event.draft.player.id === event.draft.team.captainId
                  }
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="text-sm font-medium">
                  <span className="text-orange-300 font-bold">
                    Pick #{event.draft.pickNumber}
                  </span>
                  {" - "}
                  <a
                    href={`/player/${event.draft.player.id}`}
                    className="hover:underline"
                  >
                    <span className="font-semibold">
                      {event.draft.player.name}
                    </span>
                  </a>
                  {" drafted by "}
                  <a
                    href={`/team/${event.draft.team.id}`}
                    className="hover:underline"
                  >
                    <span className="text-yellow-300 font-bold">
                      {event.user?.name || "Unknown"}
                    </span>
                    {" to "}
                    <span className="text-green-300 font-bold">
                      {event.draft.team.name}
                    </span>
                  </a>
                </div>
                <div
                  className="text-xs text-gray-400"
                  title={event.createdAt.toLocaleString()}
                >
                  {formatTimeAgo(new Date(event.createdAt))}
                </div>
              </div>
            </div>
          );
        }

        if (
          event.eventType === "season_state_change" &&
          event.seasonStateChange
        ) {
          const { fromState, toState } = event.seasonStateChange;
          return (
            <div
              key={event.id}
              className="flex items-center gap-3 p-3 bg-cell-gray/40 border border-cell-gray/50 rounded-lg"
            >
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="text-sm font-medium">
                  <span className="text-purple-300">Season State Change</span>
                  {": "}
                  {fromState ? (
                    <>
                      <span className="text-gray-400">{fromState}</span>
                      {" → "}
                    </>
                  ) : null}
                  <span className="font-semibold text-pink-300">{toState}</span>
                  {event.user && (
                    <>
                      {" by "}
                      <span className="text-yellow-300 font-bold">
                        {event.user.name}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className="text-xs text-gray-400"
                  title={event.createdAt.toLocaleString()}
                >
                  {formatTimeAgo(new Date(event.createdAt))}
                </div>
              </div>
            </div>
          );
        }

        if (event.eventType === "trade" && event.trade) {
          const { trade, action } = event.trade;
          const fromPlayers = trade.tradePlayers.filter(
            (tp) => tp.fromTeamId === trade.fromTeam.id,
          );
          const toPlayers = trade.tradePlayers.filter(
            (tp) => tp.fromTeamId === trade.toTeam.id,
          );

          let actionText: string;
          let actionColor: string;
          if (action === "proposed") {
            actionText = "Trade Proposed";
            actionColor = "text-cyan-300";
          } else if (action === "accepted") {
            actionText = "Trade Accepted";
            actionColor = "text-green-300";
          } else if (action === "rejected") {
            actionText = "Trade Rejected";
            actionColor = "text-red-300";
          } else {
            actionText = "Trade Cancelled";
            actionColor = "text-orange-300";
          }

          return (
            <div
              key={event.id}
              className="flex items-center gap-3 p-3 bg-cell-gray/40 border border-cell-gray/50 rounded-lg"
            >
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="text-sm font-medium">
                  <a
                    href={`/trade/${trade.id}`}
                    className={`${actionColor} font-bold hover:underline`}
                  >
                    {actionText}
                  </a>
                  {" between "}
                  <a
                    href={`/team/${trade.fromTeam.id}`}
                    className="hover:underline"
                  >
                    <span className="text-green-300 font-bold">
                      {trade.fromTeam.name}
                    </span>
                  </a>
                  {" and "}
                  <a
                    href={`/team/${trade.toTeam.id}`}
                    className="hover:underline"
                  >
                    <span className="text-green-300 font-bold">
                      {trade.toTeam.name}
                    </span>
                  </a>
                  {": "}
                  {fromPlayers.length > 0 && (
                    <>
                      <span className="text-yellow-300">
                        {trade.fromTeam.name}
                      </span>
                      {" sends "}
                      {fromPlayers.map((tp, idx) => (
                        <span key={tp.playerId}>
                          <a
                            href={`/player/${tp.player.id}`}
                            className="hover:underline font-semibold"
                          >
                            {tp.player.name}
                          </a>
                          {idx < fromPlayers.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </>
                  )}
                  {fromPlayers.length > 0 && toPlayers.length > 0 && " - "}
                  {toPlayers.length > 0 && (
                    <>
                      <span className="text-yellow-300">
                        {trade.toTeam.name}
                      </span>
                      {" sends "}
                      {toPlayers.map((tp, idx) => (
                        <span key={tp.playerId}>
                          <a
                            href={`/player/${tp.player.id}`}
                            className="hover:underline font-semibold"
                          >
                            {tp.player.name}
                          </a>
                          {idx < toPlayers.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </>
                  )}
                </div>
                {action === "proposed" && trade.proposalText && (
                  <div className="text-sm text-gray-300">
                    <span className="text-gray-400">
                      Message from {trade.fromTeam.name}:{" "}
                    </span>
                    {renderMentionedText(trade.proposalText, context)}
                  </div>
                )}
                {action !== "proposed" && trade.responseText && (
                  <div className="text-sm text-gray-300">
                    <span className="text-gray-400">
                      {action === "cancelled"
                        ? `Cancellation reason from ${trade.fromTeam.name}: `
                        : `Response from ${trade.toTeam.name}: `}
                    </span>
                    {renderMentionedText(trade.responseText, context)}
                  </div>
                )}
                <div
                  className="text-xs text-gray-400"
                  title={event.createdAt.toLocaleString()}
                >
                  {formatTimeAgo(new Date(event.createdAt))}
                </div>
              </div>
            </div>
          );
        }

        if (
          event.eventType === "trade_preferences_update" &&
          event.tradePreferencesUpdate
        ) {
          const { team, lookingFor, willingToTrade } =
            event.tradePreferencesUpdate;
          return (
            <div
              key={event.id}
              className="flex items-center gap-3 p-3 bg-cell-gray/40 border border-cell-gray/50 rounded-lg"
            >
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="text-sm font-medium">
                  <span className="text-teal-300 font-bold">
                    Trade Preferences Updated
                  </span>
                  {" for "}
                  <a href={`/team/${team.id}`} className="hover:underline">
                    <span className="text-green-300 font-bold">
                      {team.name}
                    </span>
                  </a>
                  {": "}
                </div>
                <div className="flex flex-col gap-4">
                  {lookingFor && (
                    <div>
                      <p className="text-gray-300">Looking For: </p>
                      {renderMentionedText(lookingFor, context)}
                    </div>
                  )}
                  {willingToTrade && (
                    <div>
                      <p className="text-gray-300">Willing to Trade:</p>
                      {renderMentionedText(willingToTrade, context)}
                    </div>
                  )}
                </div>
                <div
                  className="text-xs text-gray-400 mt-1"
                  title={event.createdAt.toLocaleString()}
                >
                  {formatTimeAgo(new Date(event.createdAt))}
                </div>
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
