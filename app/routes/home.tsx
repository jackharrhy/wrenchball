import type { Route } from "./+types/home";
import { db } from "~/database/db";
import { events } from "~/database/schema";
import { desc } from "drizzle-orm";
import { Events } from "~/components/Events";

export async function loader({}: Route.LoaderArgs) {
  const allEvents = await db.query.events.findMany({
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
    },
    orderBy: [desc(events.createdAt)],
    limit: 50,
  });

  return { events: allEvents };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <main className="flex-1 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-6xl font-bold font-happiness">Lil Slug Crew</h1>
          <h2 className="text-2xl font-bold">Welcome to Season 3!</h2>
        </div>
        <div className="max-w-4xl mx-auto w-full">
          <h3 className="text-xl font-semibold mb-4">Recent Events</h3>
          <Events events={loaderData.events} />
        </div>
      </main>
      <footer className="text-center">
        <p>
          <a href="/kitchen-sink" className="underline hover:text-gray-200">
            Kitchen Sink
          </a>
        </p>
      </footer>
    </>
  );
}
