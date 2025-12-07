import { sql, desc } from "drizzle-orm";
import { events } from "~/database/schema";
import type { db as Database } from "~/database/db";

/**
 * The "with" clause for events queries - defines all the relations to include
 */
export const eventsWithClause = {
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
          fromTeam: {
            with: {
              captain: true,
            },
          },
          toTeam: {
            with: {
              captain: true,
            },
          },
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
} as const;

export type EventWithRelations = Awaited<
  ReturnType<typeof getEvents>
>["events"][number];

/**
 * Fetches paginated events with all relations.
 * @param db - Database instance
 * @param options - Pagination options
 */
export async function getEvents(
  db: typeof Database,
  {
    page = 1,
    pageSize = 30,
  }: {
    page?: number;
    pageSize?: number;
  } = {},
) {
  const offset = (page - 1) * pageSize;

  const [eventsList, totalResult] = await Promise.all([
    db.query.events.findMany({
      with: eventsWithClause,
      orderBy: [desc(events.createdAt)],
      limit: pageSize,
      offset,
    }),
    db.select({ count: sql<number>`count(*)` }).from(events),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return {
    events: eventsList,
    page,
    pageSize,
    total,
    totalPages,
  };
}

/**
 * Extracts mention texts from events for resolution
 */
export function extractMentionTextsFromEvents(
  eventsList: EventWithRelations[],
): (string | null)[] {
  const tradePreferencesTexts = eventsList
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

  const tradeProposalTexts = eventsList
    .filter((e) => e.trade?.trade?.proposalText)
    .map((e) => e.trade!.trade!.proposalText);

  const tradeResponseTexts = eventsList
    .filter((e) => e.trade?.trade?.responseText)
    .map((e) => e.trade!.trade!.responseText);

  return [
    ...tradePreferencesTexts,
    ...tradeProposalTexts,
    ...tradeResponseTexts,
  ];
}
