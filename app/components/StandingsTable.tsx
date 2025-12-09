import { Link } from "react-router";
import { cn } from "~/utils/cn";
import { TeamLogo } from "~/components/TeamLogo";
import type {
  SerializedStandingsData,
  StandingsRow,
} from "~/utils/standings.server";

type StandingsTableProps = {
  data: SerializedStandingsData;
};

type DeserializedRow = Omit<StandingsRow, "matchDayResults"> & {
  matchDayResults: [
    number,
    StandingsRow["matchDayResults"] extends Map<number, infer V> ? V : never,
  ][];
};

export function StandingsTable({ data }: StandingsTableProps) {
  const { matchDays, standings } = data;

  if (standings.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-cell-gray/50 bg-cell-gray/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cell-gray/50">
            <th className="sticky left-0 z-20 bg-cell-gray/60 backdrop-blur-sm px-3 py-2.5 text-center text-xs font-semibold text-gray-400 w-10">
              #
            </th>
            <th className="sticky left-10 z-20 bg-cell-gray/60 backdrop-blur-sm px-3 py-2.5 text-left text-xs font-semibold text-gray-400 min-w-[140px]">
              Team
            </th>
            {matchDays.map((md, idx) => (
              <th
                key={md.id}
                colSpan={2}
                className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 min-w-[80px]"
              >
                Week {idx + 1}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 border-l border-cell-gray/50 min-w-[40px]">
              W
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 min-w-[40px]">
              L
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 min-w-[50px]">
              +/-
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 min-w-[50px]">
              RD
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cell-gray/30">
          {(standings as DeserializedRow[]).map((row, index) => {
            const resultsMap = new Map(row.matchDayResults);

            return (
              <tr
                key={row.userId}
                className="bg-cell-gray/40 hover:bg-cell-gray/60 transition-colors"
              >
                <td className="sticky left-0 z-10 bg-cell-gray/60 backdrop-blur-sm px-3 py-2.5 text-center font-rodin text-gray-400">
                  {index + 1}
                </td>
                <td className="sticky left-10 z-10 bg-cell-gray/60 backdrop-blur-sm px-3 py-2.5">
                  <Link
                    to={`/team/${row.teamId}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <TeamLogo
                      captainStatsCharacter={
                        row.captainStatsCharacter ?? undefined
                      }
                      size="xs"
                    />
                    <span className="font-semibold text-gray-100">
                      {row.teamName}
                    </span>
                    <span className="text-xs text-gray-200/80">
                      {row.userName}
                    </span>
                  </Link>
                </td>
                {matchDays.map((md) => {
                  const result = resultsMap.get(md.id);
                  if (!result) {
                    return (
                      <td
                        key={`${md.id}-empty`}
                        colSpan={2}
                        className="px-3 py-2.5 text-center text-gray-500"
                      >
                        -
                      </td>
                    );
                  }

                  return (
                    <td
                      key={md.id}
                      colSpan={2}
                      className={cn(
                        "px-3 py-2.5 text-center",
                        result.isWin ? "bg-green-500/20" : "bg-red-500/20",
                      )}
                    >
                      <span
                        className={cn(
                          "font-rodin",
                          result.isWin ? "text-green-300" : "text-gray-300/80",
                        )}
                      >
                        {result.userScore}
                      </span>
                      <span className="text-gray-200/50 font-bold mx-1">-</span>
                      <span
                        className={cn(
                          "font-rodin",
                          !result.isWin ? "text-red-300" : "text-gray-300/80",
                        )}
                      >
                        {result.opponentScore}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center font-rodin text-green-300 border-l border-cell-gray/50">
                  {row.wins}
                </td>
                <td className="px-3 py-2.5 text-center font-rodin text-red-300/80">
                  {row.losses}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center font-rodin",
                    row.wlRatio > 0
                      ? "text-green-300"
                      : row.wlRatio < 0
                        ? "text-red-300/80"
                        : "text-gray-400",
                  )}
                >
                  {row.wlRatio > 0 ? `+${row.wlRatio}` : row.wlRatio}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center font-rodin",
                    row.runDifferential > 0
                      ? "text-green-300"
                      : row.runDifferential < 0
                        ? "text-red-300/80"
                        : "text-gray-400",
                  )}
                >
                  {row.runDifferential > 0
                    ? `+${row.runDifferential}`
                    : row.runDifferential}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
