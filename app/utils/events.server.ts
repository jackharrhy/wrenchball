import { eq, and, count } from "drizzle-orm";
import { type Database } from "~/database/db";
import {
  events,
  eventDraft,
  eventSeasonStateChange,
  type SeasonState,
  users,
  players,
  teams,
} from "~/database/schema";
import { postEvent } from "~/discord/client.server";
import { BASE_URL } from "~/server-consts";

/**
 * Calculates the next pick number for a season by counting existing draft events
 */
export const getPickNumber = async (
  db: Database,
  seasonId: number,
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
  db: Database,
  userId: number,
  playerId: number,
  teamId: number,
  seasonId: number,
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

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) {
      throw new Error("Player not found");
    }

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error("Team not found");
    }

    await postEvent(
      "draft",
      `_Pick #${pickNumber}_: **[${player.name}](${BASE_URL}/player/${player.id})** drafted by **[${user.name}](${BASE_URL}/team/${team.id})** to **[${team.name}](${BASE_URL}/team/${team.id})**`,
    );

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
  db: Database,
  userId: number,
  fromState: SeasonState | null,
  toState: SeasonState,
  seasonId: number,
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

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    await postEvent(
      "season_state_change",
      `_Season State Change_: ${fromState ?? "unknown"} → **${toState}** by **${user.name}**`,
    );

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
