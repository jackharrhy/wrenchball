import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/matches";
import { db } from "~/database/db";
import { matches, matchBattingOrders } from "~/database/schema";
import { cn } from "~/utils/cn";
import { asc, desc } from "drizzle-orm";
import { Field } from "~/components/Field";

export async function loader({ request }: Route.LoaderArgs) {
  const allMatches = await db.query.matches.findMany({
    with: {
      teamA: true,
      teamB: true,
    },
    orderBy: [asc(matches.scheduledDate), desc(matches.createdAt)],
  });

  return { matches: allMatches };
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

function getStateColor(state: string) {
  switch (state) {
    case "upcoming":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "live":
      return "bg-green-500/20 text-green-300 border-green-500/40";
    case "finished":
      return "bg-gray-500/20 text-gray-300 border-gray-500/40";
    default:
      return "bg-gray-500/20 text-gray-300 border-gray-500/40";
  }
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { matches } = loaderData;

  if (matches.length === 0) {
    return (
      <div className="text-center text-gray-400 italic py-8">
        No matches scheduled yet.
      </div>
    );
  }

  // Group matches by state
  const upcomingMatches = matches.filter((m) => m.state === "upcoming");
  const liveMatches = matches.filter((m) => m.state === "live");
  const finishedMatches = matches.filter((m) => m.state === "finished");

  return (
    <div className="space-y-8">
      {liveMatches.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 text-green-400">Live Now</h2>
          <div className="space-y-3">
            {liveMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}

      {upcomingMatches.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 text-blue-400">Upcoming</h2>
          <div className="space-y-3">
            {upcomingMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}

      {finishedMatches.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 text-gray-400">Finished</h2>
          <div className="space-y-3">
            {finishedMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type MatchWithTeams = Awaited<ReturnType<typeof loader>>["matches"][number];

interface MatchCardProps {
  match: MatchWithTeams;
}

function MatchCard({ match }: MatchCardProps) {
  const showScore =
    match.state === "finished" &&
    match.teamAScore !== null &&
    match.teamBScore !== null;

  return (
    <Link
      to={`/match/${match.id}`}
      className={cn(
        "flex items-center gap-6 px-4 py-3 rounded-lg bg-cell-gray/40 border border-cell-gray/50 hover:bg-cell-gray/60 transition-colors",
      )}
    >
      <div className="flex-1 flex items-center justify-center gap-4">
        <span className="font-bold text-lg">{match.teamA.name}</span>
        {showScore && (
          <span className="text-xl font-bold text-yellow-300">
            {match.teamAScore}
          </span>
        )}
        <span className="text-gray-400 font-bold">
          {showScore ? "-" : "vs"}
        </span>
        {showScore && (
          <span className="text-xl font-bold text-yellow-300">
            {match.teamBScore}
          </span>
        )}
        <span className="font-bold text-lg">{match.teamB.name}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">
          {formatDate(match.scheduledDate)}
        </span>
        <span
          className={cn(
            "px-2 py-1 text-xs font-semibold rounded border capitalize",
            getStateColor(match.state),
          )}
        >
          {match.state}
        </span>
      </div>
    </Link>
  );
}
