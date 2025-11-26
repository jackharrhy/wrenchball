import { eq, and, count } from "drizzle-orm";
import { database } from "~/database/context";
import {
  events,
  eventDraft,
  eventSeasonStateChange,
  type SeasonState,
} from "~/database/schema";

/**
 * Calculates the next pick number for a season by counting existing draft events
 */
export const getPickNumber = async (
  db: ReturnType<typeof database>,
  seasonId: number
): Promise<number> => {
  const draftEvents = await db
    .select({ count: count() })
    .from(events)
    .where(and(eq(events.seasonId, seasonId), eq(events.eventType, "draft")));

  return (draftEvents[0]?.count || 0) + 1;
};

/**
 * Creates a draft event record
 * Works within an existing transaction or creates its own if needed
 */
export const createDraftEvent = async (
  db: ReturnType<typeof database>,
  userId: number,
  playerId: number,
  teamId: number,
  seasonId: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    const pickNumber = await getPickNumber(db, seasonId);

    const [event] = await db
      .insert(events)
      .values({
        eventType: "draft",
        userId,
        seasonId,
      })
      .returning({ id: events.id });

    await db.insert(eventDraft).values({
      eventId: event.id,
      playerId,
      teamId,
      pickNumber,
    });

    return { success: true };
  } catch (error) {
    console.error("Error creating draft event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create draft event",
    };
  }
};

/**
 * Creates a season state change event record
 * Works within an existing transaction or creates its own if needed
 */
export const createSeasonStateChangeEvent = async (
  db: ReturnType<typeof database>,
  userId: number | null,
  fromState: SeasonState | null,
  toState: SeasonState,
  seasonId: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    const [event] = await db
      .insert(events)
      .values({
        eventType: "season_state_change",
        userId,
        seasonId,
      })
      .returning({ id: events.id });

    await db.insert(eventSeasonStateChange).values({
      eventId: event.id,
      fromState,
      toState,
    });

    return { success: true };
  } catch (error) {
    console.error("Error creating season state change event:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create season state change event",
    };
  }
};
