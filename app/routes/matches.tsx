import type { Route } from "./+types/matches";
import { Link, useSearchParams } from "react-router";
import { db } from "~/database/db";
import { matchDays, matches } from "~/database/schema";
import { asc, desc, isNull } from "drizzle-orm";
import { cn } from "~/utils/cn";
import { StandingsTable } from "~/components/StandingsTable";
import {
  getStandingsData,
  serializeStandingsData,
} from "~/utils/standings.server";
import {
  MatchDayCard,
  MatchCard,
  getMatchDayState,
  type MatchDayData,
} from "~/components/MatchDayCard";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sortOrder = url.searchParams.get("sort") ?? "asc";
  const showCompleted = url.searchParams.get("completed") === "true";

  const allMatchDays = await db.query.matchDays.findMany({
    with: {
      matches: {
        with: {
          teamA: {
            with: {
              captain: true,
              conference: true,
              user: true,
            },
          },
          teamB: {
            with: {
              captain: true,
              conference: true,
              user: true,
            },
          },
          location: true,
        },
        orderBy: [asc(matches.orderInDay), asc(matches.scheduledDate)],
      },
    },
    orderBy: [asc(matchDays.orderInSeason)],
  });

  const orphanMatches = await db.query.matches.findMany({
    where: isNull(matches.matchDayId),
    with: {
      teamA: {
        with: {
          captain: true,
          conference: true,
          user: true,
        },
      },
      teamB: {
        with: {
          captain: true,
          conference: true,
          user: true,
        },
      },
      location: true,
    },
    orderBy: [asc(matches.scheduledDate), desc(matches.createdAt)],
  });

  const standingsData = await getStandingsData(db);

  return {
    matchDays: allMatchDays,
    orphanMatches,
    standings: serializeStandingsData(standingsData),
    filters: { sortOrder, showCompleted },
  };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { matchDays, orphanMatches, standings, filters } = loaderData;
  const [searchParams] = useSearchParams();

  const hasContent = matchDays.length > 0 || orphanMatches.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center text-gray-400 italic py-8">
        No matches scheduled yet.
      </div>
    );
  }

  const liveMatchDay = matchDays.find(
    (md) => getMatchDayState(md as MatchDayData) === "live",
  );

  let filteredMatchDays = [...matchDays];

  if (liveMatchDay) {
    filteredMatchDays = filteredMatchDays.filter(
      (md) => md.id !== liveMatchDay.id,
    );
  }

  if (!filters.showCompleted) {
    filteredMatchDays = filteredMatchDays.filter((md) => {
      const state = getMatchDayState(md as MatchDayData);
      return state !== "finished";
    });
  }

  filteredMatchDays.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : null;
    const dateB = b.date ? new Date(b.date).getTime() : null;

    if (dateA !== null && dateB !== null) {
      return filters.sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    }

    if (dateA !== null) return filters.sortOrder === "asc" ? -1 : 1;
    if (dateB !== null) return filters.sortOrder === "asc" ? 1 : -1;

    const orderA = a.orderInSeason ?? 0;
    const orderB = b.orderInSeason ?? 0;
    return filters.sortOrder === "asc" ? orderA - orderB : orderB - orderA;
  });

  const buildQueryString = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(params)) {
      if (
        value === "" ||
        (key === "sort" && value === "asc") ||
        (key === "completed" && value === "false")
      ) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    }
    const str = newParams.toString();
    return str ? `?${str}` : "";
  };

  return (
    <div className="space-y-6">
      {liveMatchDay && <MatchDayCard matchDay={liveMatchDay as MatchDayData} />}

      {standings.standings.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3">Standings</h2>
          <StandingsTable data={standings} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/matches${buildQueryString({ sort: "asc" })}`}
          preventScrollReset
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors text-sm",
            filters.sortOrder === "asc"
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Dates Ascending
        </Link>
        <Link
          to={`/matches${buildQueryString({ sort: "desc" })}`}
          preventScrollReset
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors text-sm",
            filters.sortOrder === "desc"
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Dates Descending
        </Link>
        <div className="w-px bg-cell-gray/50 mx-1" />
        <Link
          to={`/matches${buildQueryString({ completed: filters.showCompleted ? "false" : "true" })}`}
          preventScrollReset
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
        >
          <span
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              filters.showCompleted ? "bg-green-500" : "bg-cell-gray",
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                filters.showCompleted ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
          Show Completed
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredMatchDays.map((matchDay) => (
          <MatchDayCard key={matchDay.id} matchDay={matchDay as MatchDayData} />
        ))}
      </div>

      {filteredMatchDays.length === 0 && (
        <div className="text-center text-gray-400 italic py-8">
          No match days to show with current filters.
        </div>
      )}

      {orphanMatches.length > 0 && (
        <div className="rounded-xl bg-cell-gray/30 border border-cell-gray/50 p-4">
          <h3 className="text-lg font-bold mb-3 text-gray-400">
            Unscheduled Matches
          </h3>
          <div className="space-y-2">
            {orphanMatches.map((match) => (
              <MatchCard key={match.id} match={match} showDate />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
