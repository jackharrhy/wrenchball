import type { Route } from "./+types/events";
import { db } from "~/database/db";
import { Events } from "~/components/Events";
import { Pagination } from "~/components/Pagination";
import { resolveMentionsMultiple } from "~/utils/mentions.server";
import { getEvents, extractMentionTextsFromEvents } from "~/utils/events.query";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

  const paginatedEvents = await getEvents(db, { page, pageSize: 30 });

  const mentionTexts = extractMentionTextsFromEvents(paginatedEvents.events);
  const { mergedContext } = await resolveMentionsMultiple(db, mentionTexts);

  return {
    events: paginatedEvents.events,
    pagination: {
      page: paginatedEvents.page,
      totalPages: paginatedEvents.totalPages,
    },
    mentionContext: {
      players: Array.from(mergedContext.players.entries()),
      teams: Array.from(mergedContext.teams.entries()),
    },
  };
}

export default function EventsPage({ loaderData }: Route.ComponentProps) {
  const mentionContext = {
    players: new Map(loaderData.mentionContext.players),
    teams: new Map(loaderData.mentionContext.teams),
  };

  return (
    <div className="flex flex-col gap-6 items-center">
      <Pagination
        page={loaderData.pagination.page}
        totalPages={loaderData.pagination.totalPages}
      />
      <div className="max-w-4xl w-full">
        <Events events={loaderData.events} mentionContext={mentionContext} />
      </div>
      <Pagination
        page={loaderData.pagination.page}
        totalPages={loaderData.pagination.totalPages}
      />
    </div>
  );
}
