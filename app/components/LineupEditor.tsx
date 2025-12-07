import { useState, useMemo } from "react";
import { Form } from "react-router";
import type {
  Player,
  TeamLineup,
  FieldingPosition,
  Team,
} from "~/database/schema";
import { PlayerIcon } from "./PlayerIcon";
import { Lineup } from "./Lineup";
import { fieldingPositions } from "~/database/schema";
import { LINEUP_SIZE } from "~/consts";

interface LineupEditorEntry {
  playerId: number;
  fieldingPosition: FieldingPosition | null;
  battingOrder: number | null;
  isStarred: boolean;
}

interface LineupEditorProps {
  team: Team & {
    players: ((Player & { lineup?: TeamLineup }) | null)[];
    captain?: Pick<Player, "statsCharacter"> | null;
  };
}

export function LineupEditor({ team }: LineupEditorProps) {
  const teamPlayers = team.players.filter(
    (p): p is Player & { lineup?: TeamLineup } => p !== null,
  );

  // Initialize state from existing lineup data
  const [lineupEntries, setLineupEntries] = useState<LineupEditorEntry[]>(
    () => {
      return teamPlayers.map((player) => ({
        playerId: player.id,
        fieldingPosition: player.lineup?.fieldingPosition ?? null,
        battingOrder: player.lineup?.battingOrder ?? null,
        isStarred: player.lineup?.isStarred ?? false,
      }));
    },
  );

  // Check if a player is a Mii (cannot be starred)
  const isMiiPlayer = (player: Player) => {
    const char = player.statsCharacter;
    return char?.endsWith("Mii") || char?.endsWith("Mii (F)");
  };

  // Set starred player (only one can be starred at a time)
  const setStarredPlayer = (playerId: number, isStarred: boolean) => {
    setLineupEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        isStarred: entry.playerId === playerId ? isStarred : false,
      })),
    );
  };

  // Swap fielding position with player who has the target position
  const swapFieldingPosition = (
    playerId: number,
    newPosition: FieldingPosition | null,
  ) => {
    setLineupEntries((prev) => {
      const currentEntry = prev.find((e) => e.playerId === playerId);
      const oldPosition = currentEntry?.fieldingPosition ?? null;
      const oldBattingOrder = currentEntry?.battingOrder ?? null;

      // Find player currently at the new position (if any)
      const playerAtNewPosition =
        newPosition !== null
          ? prev.find(
              (e) =>
                e.fieldingPosition === newPosition && e.playerId !== playerId,
            )
          : null;

      return prev.map((entry) => {
        if (entry.playerId === playerId) {
          // Moving to bench clears batting order
          if (newPosition === null) {
            return { ...entry, fieldingPosition: null, battingOrder: null };
          }
          // If coming from bench (no batting order) and replacing someone, take their batting order
          if (oldBattingOrder === null && playerAtNewPosition) {
            return {
              ...entry,
              fieldingPosition: newPosition,
              battingOrder: playerAtNewPosition.battingOrder,
            };
          }
          // Already have a batting order, just change position
          return { ...entry, fieldingPosition: newPosition };
        }
        // Swap: give old position to the player who had the new position
        if (
          playerAtNewPosition &&
          entry.playerId === playerAtNewPosition.playerId
        ) {
          // If swapping with bench player (no batting order), go to bench
          if (oldBattingOrder === null) {
            return { ...entry, fieldingPosition: null, battingOrder: null };
          }
          // Both players have batting orders, just swap positions (keep own batting order)
          return { ...entry, fieldingPosition: oldPosition };
        }
        return entry;
      });
    });
  };

  // Swap batting order with player who has the target order
  const swapBattingOrder = (playerId: number, newOrder: number | null) => {
    setLineupEntries((prev) => {
      const currentEntry = prev.find((e) => e.playerId === playerId);
      const oldOrder = currentEntry?.battingOrder ?? null;

      // Find player currently at the new batting order (if any)
      const playerAtNewOrder =
        newOrder !== null
          ? prev.find(
              (e) => e.battingOrder === newOrder && e.playerId !== playerId,
            )
          : null;

      return prev.map((entry) => {
        if (entry.playerId === playerId) {
          return { ...entry, battingOrder: newOrder };
        }
        // Swap: give old order to the player who had the new order
        if (playerAtNewOrder && entry.playerId === playerAtNewOrder.playerId) {
          return { ...entry, battingOrder: oldOrder };
        }
        return entry;
      });
    });
  };

  // Convert lineup entries to format expected by Field component
  const playersForPreview = useMemo(() => {
    return teamPlayers.map((player) => {
      const entry = lineupEntries.find((e) => e.playerId === player.id);
      return {
        ...player,
        lineup: entry
          ? {
              playerId: entry.playerId,
              fieldingPosition: entry.fieldingPosition,
              battingOrder: entry.battingOrder,
              isStarred: entry.isStarred,
            }
          : undefined,
      };
    });
  }, [teamPlayers, lineupEntries]);

  const allPositions: (FieldingPosition | "bench")[] = [
    ...fieldingPositions.enumValues,
    "bench",
  ];

  const battingOrderOptions = [
    { value: "none", label: "None" },
    ...Array.from({ length: LINEUP_SIZE }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
    })),
  ];

  return (
    <div className="bg-cell-gray/40 rounded-md border border-cell-gray/50 p-3">
      <div className="flex gap-4">
        {/* Editor */}
        <div className="flex-1">
          <Form method="post" className="space-y-1">
            <input type="hidden" name="intent" value="update-lineup" />
            <div className="space-y-1">
              {teamPlayers.map((player, index) => {
                const entry = lineupEntries.find(
                  (e) => e.playerId === player.id,
                );
                const isCaptain =
                  team.captainId !== null &&
                  team.captainId !== undefined &&
                  player.id === team.captainId;

                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 py-1 px-2 border rounded bg-cell-gray/20 border-cell-gray/30"
                  >
                    <div className="flex items-center gap-2 min-w-[16rem]">
                      <PlayerIcon
                        player={player}
                        size="md"
                        isCaptain={isCaptain}
                        isStarred={entry?.isStarred ?? false}
                      />
                      <span className="text-xs font-medium truncate">
                        {player.name}
                        {isCaptain && (
                          <span className="ml-1 text-[10px] text-red-400">
                            (C)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-1">
                      <label
                        htmlFor={`starred-${player.id}`}
                        className="text-[10px] text-gray-400"
                      >
                        Star
                      </label>
                      <input
                        type="checkbox"
                        id={`starred-${player.id}`}
                        checked={entry?.isStarred ?? false}
                        onChange={(e) =>
                          setStarredPlayer(player.id, e.target.checked)
                        }
                        disabled={isMiiPlayer(player)}
                        className="w-4 h-4 accent-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          isMiiPlayer(player)
                            ? "Mii characters cannot be starred"
                            : "Star this player"
                        }
                      />
                      <input
                        type="hidden"
                        name={`entries[${index}][isStarred]`}
                        value={entry?.isStarred ? "true" : "false"}
                      />
                      <label
                        htmlFor={`position-${player.id}`}
                        className="text-[10px] text-gray-400"
                      >
                        Pos
                      </label>
                      <select
                        id={`position-${player.id}`}
                        name={`entries[${index}][fieldingPosition]`}
                        value={entry?.fieldingPosition ?? "bench"}
                        onChange={(e) => {
                          const value =
                            e.target.value === "bench"
                              ? null
                              : (e.target.value as FieldingPosition);
                          swapFieldingPosition(player.id, value);
                        }}
                        className="px-1.5 py-0.5 text-xs border rounded bg-white text-black border-gray-300 w-[6rem]"
                      >
                        {allPositions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos === "bench" ? "Bench" : pos}
                          </option>
                        ))}
                      </select>

                      <label
                        htmlFor={`batting-${player.id}`}
                        className="text-[10px] text-gray-400 ml-1"
                      >
                        Bat
                      </label>
                      <select
                        id={`batting-${player.id}`}
                        name={`entries[${index}][battingOrder]`}
                        value={entry?.battingOrder ?? "none"}
                        onChange={(e) => {
                          const value =
                            e.target.value === "none"
                              ? null
                              : parseInt(e.target.value, 10);
                          swapBattingOrder(player.id, value);
                        }}
                        disabled={entry?.fieldingPosition === null}
                        className="px-1.5 py-0.5 text-xs border rounded bg-white text-black border-gray-300 w-[6rem] disabled:bg-gray-200 disabled:cursor-not-allowed"
                      >
                        {battingOrderOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="hidden"
                      name={`entries[${index}][playerId]`}
                      value={player.id}
                    />
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm cursor-pointer"
              >
                Save Lineup
              </button>
            </div>
          </Form>
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center justify-center p-8">
          <Lineup
            players={playersForPreview}
            captainId={team.captainId}
            captainStatsCharacter={team.captain?.statsCharacter}
          />
        </div>
      </div>
    </div>
  );
}
