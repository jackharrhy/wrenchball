import type { Event } from "~/database/schema";
import { PlayerIcon } from "~/components/PlayerIcon";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

type EventWithRelations = Event & {
  user?: { id: number; name: string } | null;
  draft?: {
    playerId: number;
    teamId: number;
    pickNumber: number;
    player: { id: number; name: string; imageUrl: string | null };
    team: { id: number; name: string; abbreviation: string };
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
};

export function Events({ events }: { events: EventWithRelations[] }) {
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
              <div className="flex-shrink-0">
                <PlayerIcon player={event.draft.player} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
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
                  className="text-xs text-gray-400 mt-1"
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
              <div className="flex-1 min-w-0">
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
                  className="text-xs text-gray-400 mt-1"
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
            (tp) => tp.fromTeamId === trade.fromTeam.id
          );
          const toPlayers = trade.tradePlayers.filter(
            (tp) => tp.fromTeamId === trade.toTeam.id
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
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  <span className={`${actionColor} font-bold`}>
                    {actionText}
                  </span>
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
                  {fromPlayers.length > 0 && toPlayers.length > 0 && " | "}
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
