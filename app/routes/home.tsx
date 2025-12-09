import type { Route } from "./+types/home";
import { db } from "~/database/db";
import { Events } from "~/components/Events";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import { getLeaderboardData } from "~/utils/leaderboard.server";
import { LeaderboardTable } from "~/components/LeaderboardTable";
import { Link } from "react-router";
import { getEvents, extractMentionTextsFromEvents } from "~/utils/events.query";
import { StandingsTable } from "~/components/StandingsTable";
import {
  getStandingsData,
  serializeStandingsData,
} from "~/utils/standings.server";

export async function loader({}: Route.LoaderArgs) {
  const [paginatedEvents, leaderboardPlayers, standingsData] =
    await Promise.all([
      getEvents(db, { page: 1, pageSize: 30 }),
      getLeaderboardData(db, 10),
      getStandingsData(db),
    ]);

  const mentionTexts = extractMentionTextsFromEvents(paginatedEvents.events);
  const { mergedContext } = await resolveMentionsMultiple(db, mentionTexts);

  // Limit standings to top 5
  const top5Standings = {
    ...standingsData,
    standings: standingsData.standings.slice(0, 5),
  };

  return {
    events: paginatedEvents.events,
    leaderboardPlayers,
    standings: serializeStandingsData(top5Standings),
    mentionContext: {
      players: Array.from(mergedContext.players.entries()),
      teams: Array.from(mergedContext.teams.entries()),
    },
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const mentionContext = {
    players: new Map(loaderData.mentionContext.players),
    teams: new Map(loaderData.mentionContext.teams),
  };

  return (
    <>
      <main className="flex-1 flex flex-col gap-6 items-center">
        <h1 className="text-6xl font-bold font-happiness">Lil Slug Crew</h1>

        {/* Top 5 Standings */}
        {loaderData.standings.standings.length > 0 && (
          <div className="w-full flex flex-col gap-4">
            <h3 className="text-xl font-semibold mb-4">Top 5 Players</h3>
            <StandingsTable data={loaderData.standings} />
            <div className="text-center">
              <Link
                to="/matches"
                className="inline-block text-sm px-6 py-2 bg-cell-gray/60 border-2 border-cell-gray rounded hover:bg-cell-gray/80 transition-colors"
              >
                See All Standings
              </Link>
            </div>
          </div>
        )}

        {/* Top 10 Leaderboard */}
        <div className="w-full">
          <h3 className="text-xl font-semibold mb-4">Top 10 Players</h3>
          <LeaderboardTable players={loaderData.leaderboardPlayers} />
          <div className="mt-4 text-center">
            <Link
              to="/players"
              className="inline-block text-sm px-6 py-2 bg-cell-gray/60 border-2 border-cell-gray rounded hover:bg-cell-gray/80 transition-colors"
            >
              See Full Leaderboard
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full">
          <h3 className="text-xl font-semibold mb-4">Recent Events</h3>
          <Events events={loaderData.events} mentionContext={mentionContext} />
          <div className="mt-4 text-center">
            <Link
              to="/events"
              className="inline-block text-sm px-6 py-2 bg-cell-gray/60 border-2 border-cell-gray rounded hover:bg-cell-gray/80 transition-colors"
            >
              See All Events
            </Link>
          </div>
        </div>
      </main>
      <footer className="text-center py-4">
        <p>
          <a href="/kitchen-sink" className="underline hover:text-gray-200">
            Kitchen Sink
          </a>
        </p>
      </footer>
    </>
  );
}
