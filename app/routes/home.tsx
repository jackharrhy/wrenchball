import type { Route } from "./+types/home";
import { db } from "~/database/db";
import { events } from "~/database/schema";
import { desc } from "drizzle-orm";
import { Events } from "~/components/Events";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import { getLeaderboardData } from "~/utils/leaderboard.server";
import { LeaderboardTable } from "~/components/LeaderboardTable";
import { Link } from "react-router";

export async function loader({}: Route.LoaderArgs) {
  const [allEvents, leaderboardPlayers] = await Promise.all([
    db.query.events.findMany({
      with: {
        user: true,
        draft: {
          with: {
            player: {
              with: {
                lineup: true,
              },
            },
            team: true,
          },
        },
        seasonStateChange: true,
        trade: {
          with: {
            trade: {
              with: {
                fromTeam: true,
                toTeam: true,
                tradePlayers: {
                  with: {
                    player: true,
                  },
                },
              },
            },
          },
        },
        tradePreferencesUpdate: {
          with: {
            team: true,
          },
        },
      },
      orderBy: [desc(events.createdAt)],
      limit: 50,
    }),
    getLeaderboardData(db, 10),
  ]);

  const tradePreferencesTexts = allEvents
    .filter((e) => e.tradePreferencesUpdate)
    .flatMap((e) => {
      const update = e.tradePreferencesUpdate!;
      const lookingFor =
        typeof update.lookingFor === "string" ? update.lookingFor : null;
      const willingToTrade =
        typeof update.willingToTrade === "string"
          ? update.willingToTrade
          : null;
      return [lookingFor, willingToTrade];
    });

  const tradeProposalTexts = allEvents
    .filter((e) => e.trade?.trade?.proposalText)
    .map((e) => e.trade!.trade!.proposalText);

  const tradeResponseTexts = allEvents
    .filter((e) => e.trade?.trade?.responseText)
    .map((e) => e.trade!.trade!.responseText);

  const { mergedContext } = await resolveMentionsMultiple(db, [
    ...tradePreferencesTexts,
    ...tradeProposalTexts,
    ...tradeResponseTexts,
  ]);

  return {
    events: allEvents,
    leaderboardPlayers,
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
        <h2 className="text-2xl font-bold">Welcome to Season 3!</h2>

        {/* Top 10 Leaderboard */}
        <div className="w-full">
          <h3 className="text-xl font-semibold mb-4">Top 10 Players</h3>
          <LeaderboardTable players={loaderData.leaderboardPlayers} />
          <div className="mt-4 text-center">
            <Link
              to="/players"
              className="inline-block px-6 py-2 bg-cell-gray/60 border-2 border-cell-gray rounded hover:bg-cell-gray/80 transition-colors"
            >
              See Full Leaderboard
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full">
          <h3 className="text-xl font-semibold mb-4">Recent Events</h3>
          <Events events={loaderData.events} mentionContext={mentionContext} />
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
