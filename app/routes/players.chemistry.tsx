import { PlayerIcon } from "~/components/PlayerIcon";
import type { Route } from "./+types/players.chemistry";
import { db } from "~/database/db";
import { cn } from "~/utils/cn";
import { useState } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const allPlayers = await db.query.players.findMany({
    with: {
      team: true,
      stats: true,
    },
    orderBy: (players, { asc }) => asc(players.sortPosition),
  });

  // Get all unique stat characters
  const allStats = await db.query.stats.findMany();

  // Get all chemistry relationships
  const allChemistry = await db.query.chemistry.findMany();

  // Create a map for quick chemistry lookup
  const chemistryMap = new Map<string, Map<string, "positive" | "negative">>();
  for (const chem of allChemistry) {
    if (!chemistryMap.has(chem.character1)) {
      chemistryMap.set(chem.character1, new Map());
    }
    if (!chemistryMap.has(chem.character2)) {
      chemistryMap.set(chem.character2, new Map());
    }
    chemistryMap.get(chem.character1)!.set(chem.character2, chem.relationship);
    chemistryMap.get(chem.character2)!.set(chem.character1, chem.relationship);
  }

  // Create a map of stat character to player for displaying icons
  const characterToPlayerMap = new Map<string, (typeof allPlayers)[0]>();
  for (const player of allPlayers) {
    if (player.statsCharacter) {
      characterToPlayerMap.set(player.statsCharacter, player);
    }
  }

  // Create a map of stat character to sortPosition
  const characterToSortPositionMap = new Map<string, number>();
  for (const player of allPlayers) {
    if (player.statsCharacter) {
      characterToSortPositionMap.set(
        player.statsCharacter,
        player.sortPosition,
      );
    }
  }

  // Sort stats by sortPosition (players with sortPosition first, then alphabetically)
  const sortedStats = [...allStats].sort((a, b) => {
    const aSortPos = characterToSortPositionMap.get(a.character);
    const bSortPos = characterToSortPositionMap.get(b.character);

    // If both have sort positions, sort by that
    if (aSortPos !== undefined && bSortPos !== undefined) {
      return aSortPos - bSortPos;
    }
    // If only one has a sort position, prioritize it
    if (aSortPos !== undefined) return -1;
    if (bSortPos !== undefined) return 1;
    // If neither has a sort position, sort alphabetically
    return a.character.localeCompare(b.character);
  });

  return {
    players: allPlayers,
    stats: sortedStats,
    chemistryMap,
    characterToPlayerMap,
  };
}

export default function PlayersChemistry({ loaderData }: Route.ComponentProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  const getChemistry = (
    char1: string,
    char2: string,
  ): "positive" | "negative" | null => {
    if (char1 === char2) return null;
    return loaderData.chemistryMap.get(char1)?.get(char2) ?? null;
  };

  return (
    <div className="h-full overflow-auto max-h-[calc(100vh-15rem)]">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-cell-gray/80 p-2 border border-cell-gray/50">
              {/* Empty corner cell */}
            </th>
            {loaderData.stats.map((stat) => {
              const player = loaderData.characterToPlayerMap.get(
                stat.character,
              );
              const isHovered = hoveredCol === stat.character;
              return (
                <th
                  key={stat.character}
                  className={cn(
                    "sticky top-0 z-10 p-2 border border-cell-gray/50 text-center min-w-[4rem]",
                    isHovered ? "bg-white/20" : "bg-cell-gray/40",
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <PlayerIcon player={player ?? undefined} size="sm" />
                    <span className="text-xs">{stat.character}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loaderData.stats.map((rowStat) => {
            const rowPlayer = loaderData.characterToPlayerMap.get(
              rowStat.character,
            );
            const isRowHovered = hoveredRow === rowStat.character;
            return (
              <tr key={rowStat.character}>
                <th
                  className={cn(
                    "sticky left-0 z-10 p-2 border border-cell-gray/50",
                    isRowHovered ? "bg-white/20" : "bg-cell-gray/80",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <PlayerIcon player={rowPlayer ?? undefined} size="sm" />
                    <span className="text-xs">{rowStat.character}</span>
                  </div>
                </th>
                {loaderData.stats.map((colStat) => {
                  const chem = getChemistry(
                    rowStat.character,
                    colStat.character,
                  );
                  return (
                    <td
                      key={colStat.character}
                      className={cn(
                        "p-1 border border-cell-gray/50 text-center",
                        chem === "positive" && "bg-green-500/20",
                        chem === "negative" && "bg-red-500/20",
                      )}
                      onMouseEnter={() => {
                        setHoveredRow(rowStat.character);
                        setHoveredCol(colStat.character);
                      }}
                      onMouseLeave={() => {
                        setHoveredRow(null);
                        setHoveredCol(null);
                      }}
                    >
                      {chem === "positive" && (
                        <span className="text-green-400">+</span>
                      )}
                      {chem === "negative" && (
                        <span className="text-red-400">-</span>
                      )}
                      {chem === null &&
                        rowStat.character !== colStat.character && (
                          <span className="opacity-30">·</span>
                        )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
