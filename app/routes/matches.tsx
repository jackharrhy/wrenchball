import { Link } from "react-router";
import type { Route } from "./+types/matches";
import { db } from "~/database/db";
import { matchDays, matches, type Conference } from "~/database/schema";
import { cn } from "~/utils/cn";
import { asc, desc, isNull } from "drizzle-orm";
import { TeamLogo } from "~/components/TeamLogo";
import { formatLocationName } from "~/utils/location";
import { ConferencePin } from "~/components/ConferencePin";

export async function loader({ request }: Route.LoaderArgs) {
  // Fetch match days with their matches
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

  // Also fetch matches without a match day (orphan matches)
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

  return { matchDays: allMatchDays, orphanMatches };
}

function formatDate(date: Date | null) {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatMatchDayDate(date: Date | null) {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

function getStateColor(state: string) {
  switch (state) {
    case "upcoming":
      return "bg-blue-500/20 text-blue-100 border-blue-500/40";
    case "live":
      return "bg-green-500/20 text-green-100 border-green-500/40";
    case "finished":
      return "bg-gray-500/20 text-gray-100 border-gray-500/40";
    default:
      return "bg-gray-500/20 text-gray-100 border-gray-500/40";
  }
}

function getMatchDayConferenceInfo(matchDay: MatchDayWithMatches) {
  let allMatchesCrossConference = true;
  const conferenceNames = new Map<
    number,
    { name: string; color: string | null }
  >();

  for (const match of matchDay.matches) {
    const teamAConf = match.teamA.conference;
    const teamBConf = match.teamB.conference;

    // Collect conference info
    if (teamAConf) {
      conferenceNames.set(teamAConf.id, {
        name: teamAConf.name,
        color: teamAConf.color,
      });
    }
    if (teamBConf) {
      conferenceNames.set(teamBConf.id, {
        name: teamBConf.name,
        color: teamBConf.color,
      });
    }

    // Check if this specific match is NOT cross-conference
    // (both teams have conferences and they're the same)
    const isSameConference =
      teamAConf && teamBConf && teamAConf.id === teamBConf.id;
    if (isSameConference) {
      allMatchesCrossConference = false;
    }
  }

  if (conferenceNames.size === 0) {
    return { type: "none" as const };
  }

  // Only cross-conference if ALL matches are cross-conference
  if (allMatchesCrossConference && matchDay.matches.length > 0) {
    return {
      type: "cross" as const,
      conferences: [...conferenceNames.values()],
    };
  }

  // Check if all matches are from the same conference
  if (conferenceNames.size === 1) {
    const conf = [...conferenceNames.values()][0]!;
    return { type: "single" as const, conference: conf };
  }

  // Mixed: some same-conference matches, multiple conferences represented
  return { type: "none" as const };
}

function getMatchDayState(
  matchDay: MatchDayWithMatches,
): "live" | "upcoming" | "finished" {
  const hasLive = matchDay.matches.some((m) => m.state === "live");
  if (hasLive) return "live";

  const allFinished = matchDay.matches.every((m) => m.state === "finished");
  if (allFinished && matchDay.matches.length > 0) return "finished";

  return "upcoming";
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { matchDays, orphanMatches } = loaderData;

  const hasContent = matchDays.length > 0 || orphanMatches.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center text-gray-400 italic py-8">
        No matches scheduled yet.
      </div>
    );
  }

  // Sort match days by their state priority: live > upcoming > finished
  const sortedMatchDays = [...matchDays].sort((a, b) => {
    const stateA = getMatchDayState(a);
    const stateB = getMatchDayState(b);
    const priority = { live: 0, upcoming: 1, finished: 2 };
    return priority[stateA] - priority[stateB];
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {sortedMatchDays.map((matchDay) => (
          <MatchDayCard key={matchDay.id} matchDay={matchDay} />
        ))}
      </div>

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

type MatchDayWithMatches = Awaited<
  ReturnType<typeof loader>
>["matchDays"][number];
type MatchWithTeams =
  | MatchDayWithMatches["matches"][number]
  | Awaited<ReturnType<typeof loader>>["orphanMatches"][number];

interface MatchDayCardProps {
  matchDay: MatchDayWithMatches;
}

function MatchDayCard({ matchDay }: MatchDayCardProps) {
  const conferenceInfo = getMatchDayConferenceInfo(matchDay);
  const matchDayState = getMatchDayState(matchDay);

  return (
    <div className="bg-cell-gray/30 border border-cell-gray/50 rounded-xl p-4 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-100">
            {matchDay.name ?? `Matchday`}
          </h3>
          <ConferenceBadge conferenceInfo={conferenceInfo} />
          {matchDayState === "live" && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-500/20 text-green-300 border border-green-500/40 animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <span className="text-sm text-gray-400">
          {formatMatchDayDate(matchDay.date)}
        </span>
      </div>
      <div className="space-y-2">
        {matchDay.matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

interface ConferenceBadgeProps {
  conferenceInfo: ReturnType<typeof getMatchDayConferenceInfo>;
}

function ConferenceBadge({ conferenceInfo }: ConferenceBadgeProps) {
  if (conferenceInfo.type === "none") {
    return null;
  }

  if (conferenceInfo.type === "single") {
    const { name, color } = conferenceInfo.conference;
    return (
      <span
        className="px-3 py-1 text-xs font-semibold rounded-full border"
        style={{
          backgroundColor: color ? `${color}20` : undefined,
          borderColor: color ? `${color}60` : undefined,
          color: color ?? undefined,
        }}
      >
        {name} Conference
      </span>
    );
  }

  return (
    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-400/40">
      Cross-Conference
    </span>
  );
}

interface MatchCardProps {
  match: MatchWithTeams;
  showDate?: boolean;
}

function MatchCard({ match, showDate }: MatchCardProps) {
  const hasScore =
    match.state === "finished" &&
    match.teamAScore !== null &&
    match.teamBScore !== null;

  return (
    <Link
      to={`/match/${match.id}`}
      className={cn(
        "min-h-24 lg:min-h-0 relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 rounded-lg bg-cell-gray/40 border border-cell-gray/50 hover:bg-cell-gray/60 transition-colors",
      )}
    >
      {match.state !== "finished" && (
        <span
          className={cn(
            "absolute top-1 right-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded border capitalize",
            getStateColor(match.state),
          )}
        >
          {match.state}
        </span>
      )}

      {"location" in match && match.location && (
        <span className="absolute top-1 left-1.5 text-[10px] text-gray-400">
          {formatLocationName(match.location.name)}
        </span>
      )}

      <div className="flex items-center justify-end gap-2 min-w-0">
        <div className="flex flex-col gap-0.5 font-semibold truncate text-sm">
          <p>{match.teamA.name}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-gray-200/80">
            {match.teamA.conference && (
              <ConferencePin conference={match.teamA.conference} />
            )}
            {match.teamA.user?.name}
          </p>
        </div>
        <TeamLogo
          size="sm"
          captainStatsCharacter={
            match.teamA.captain?.statsCharacter ?? undefined
          }
        />
      </div>

      <div className="flex items-center justify-center gap-2 px-3 shrink-0 w-18">
        {hasScore ? (
          <>
            <span
              className={cn(
                "text-lg font-rodin",
                match.teamAScore! > match.teamBScore!
                  ? "text-green-300"
                  : "text-gray-300/80",
              )}
            >
              {match.teamAScore}
            </span>
            <span className="text-gray-200/50 font-bold">-</span>
            <span
              className={cn(
                "text-lg font-rodin",
                match.teamBScore! > match.teamAScore!
                  ? "text-green-300"
                  : "text-gray-300/80",
              )}
            >
              {match.teamBScore}
            </span>
          </>
        ) : (
          <span className="text-gray-300/50 font-medium">vs</span>
        )}
      </div>

      <div className="flex items-center justify-start gap-2 min-w-0">
        <TeamLogo
          size="sm"
          captainStatsCharacter={
            match.teamB.captain?.statsCharacter ?? undefined
          }
        />
        <div className="flex flex-col gap-0.5 font-semibold truncate text-sm">
          <p>{match.teamB.name}</p>
          <p className="flex items-center gap-1 text-xs text-gray-200/80">
            {match.teamB.user?.name}
            {match.teamB.conference && (
              <ConferencePin conference={match.teamB.conference} />
            )}
          </p>
        </div>
        {showDate && (
          <span className="text-xs text-gray-400 ml-auto">
            {formatDate(match.scheduledDate)}
          </span>
        )}
      </div>
    </Link>
  );
}
