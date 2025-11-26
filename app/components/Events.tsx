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
                  <span className="text-blue-400">
                    Pick #{event.draft.pickNumber}
                  </span>
                  {" - "}
                  <span className="font-semibold">
                    {event.draft.player.name}
                  </span>
                  {" drafted by "}
                  <span className="text-yellow-400">
                    {event.user?.name || "Unknown"}
                  </span>
                  {" to "}
                  <span className="text-green-400">
                    {event.draft.team.abbreviation}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
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
                  <span className="text-purple-400">Season State Change</span>
                  {": "}
                  {fromState ? (
                    <>
                      <span className="text-gray-400">{fromState}</span>
                      {" → "}
                    </>
                  ) : null}
                  <span className="font-semibold text-purple-300">
                    {toState}
                  </span>
                  {event.user && (
                    <>
                      {" by "}
                      <span className="text-yellow-400">{event.user.name}</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
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
