import { Link } from "react-router";
import { cn } from "~/utils/cn";
import { TeamLogo } from "~/components/TeamLogo";
import { formatLocationName } from "~/utils/location";
import { ConferencePin } from "~/components/ConferencePin";
import type {
  Match,
  MatchDay,
  MatchLocation,
  MatchState,
  Team,
  User,
  Conference,
  Player,
} from "~/database/schema";

export type MatchTeamData = Pick<Team, "id" | "name"> & {
  captain: Pick<Player, "statsCharacter"> | null;
  conference: Pick<Conference, "id" | "name" | "color"> | null;
  user: Pick<User, "name"> | null;
};

export type MatchData = Pick<
  Match,
  "id" | "state" | "teamAScore" | "teamBScore" | "scheduledDate"
> & {
  teamA: MatchTeamData;
  teamB: MatchTeamData;
  location?: Pick<MatchLocation, "name"> | null;
};

export type MatchDayData = Pick<MatchDay, "id" | "name" | "date"> & {
  matches: MatchData[];
};

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
    timeZone: "UTC",
  }).format(new Date(date));
}

function getStateColor(state: MatchState) {
  switch (state) {
    case "upcoming":
      return "bg-blue-500/20 text-blue-100 border-blue-500/40";
    case "live":
      return "bg-green-500/20 text-green-100 border-green-500/40";
    case "finished":
      return "bg-gray-500/20 text-gray-100 border-gray-500/40";
  }
}

type ConferenceInfo =
  | { type: "none" }
  | { type: "single"; conference: Pick<Conference, "name" | "color"> }
  | { type: "cross"; conferences: Array<Pick<Conference, "name" | "color">> };

function getMatchDayConferenceInfo(matchDay: MatchDayData): ConferenceInfo {
  let allMatchesCrossConference = true;
  const conferenceNames = new Map<number, Pick<Conference, "name" | "color">>();

  for (const match of matchDay.matches) {
    const teamAConf = match.teamA.conference;
    const teamBConf = match.teamB.conference;

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

    const isSameConference =
      teamAConf && teamBConf && teamAConf.id === teamBConf.id;
    if (isSameConference) {
      allMatchesCrossConference = false;
    }
  }

  if (conferenceNames.size === 0) {
    return { type: "none" };
  }

  if (allMatchesCrossConference && matchDay.matches.length > 0) {
    return {
      type: "cross",
      conferences: [...conferenceNames.values()],
    };
  }

  if (conferenceNames.size === 1) {
    const conf = [...conferenceNames.values()][0]!;
    return { type: "single", conference: conf };
  }

  return { type: "none" };
}

export function getMatchDayState(matchDay: MatchDayData): MatchState {
  const hasLive = matchDay.matches.some((m) => m.state === "live");
  if (hasLive) return "live";

  const allFinished = matchDay.matches.every((m) => m.state === "finished");
  if (allFinished && matchDay.matches.length > 0) return "finished";

  return "upcoming";
}

export function ConferenceBadge({
  conferenceInfo,
}: {
  conferenceInfo: ConferenceInfo;
}) {
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

export function MatchCard({
  match,
  showDate,
}: {
  match: MatchData;
  showDate?: boolean;
}) {
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

      {match.location && (
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

export function MatchDayCard({ matchDay }: { matchDay: MatchDayData }) {
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
