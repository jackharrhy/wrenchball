import { eq, and, count } from "drizzle-orm";
import { type Database } from "~/database/db";
import {
  events,
  eventDraft,
  eventSeasonStateChange,
  eventTrade,
  eventMatchStateChange,
  eventTradePreferencesUpdate,
  type SeasonState,
  type TradeAction,
  type MatchState,
  users,
  players,
  teams,
  trades,
  matches,
} from "~/database/schema";
import { postEvent } from "~/discord/client.server";
import { BASE_URL } from "~/server-consts";
import { resolveMentions } from "~/utils/mentions.server";
import { mentionsToMarkdown } from "~/utils/mentions";

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

/**
 * Creates a trade event record
 * Works within an existing transaction or creates its own if needed
 */
export const createTradeEvent = async (
  db: Database,
  userId: number,
  tradeId: number,
  seasonId: number,
  action: TradeAction,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const [event] = await db
      .insert(events)
      .values({
        eventType: "trade",
        userId,
        seasonId,
      })
      .returning({ id: events.id });

    await db.insert(eventTrade).values({
      eventId: event.id,
      tradeId,
      action,
    });

    // Fetch trade with all relations for Discord message
    const trade = await db.query.trades.findFirst({
      where: eq(trades.id, tradeId),
      with: {
        fromUser: true,
        toUser: true,
        fromTeam: true,
        toTeam: true,
        tradePlayers: {
          with: {
            player: true,
          },
        },
      },
    });

    if (!trade) {
      throw new Error("Trade not found");
    }

    const fromPlayers = trade.tradePlayers.filter(
      (tp) => tp.fromTeamId === trade.fromTeam.id,
    );
    const toPlayers = trade.tradePlayers.filter(
      (tp) => tp.fromTeamId === trade.toTeam.id,
    );

    // Build Discord message
    const fromPlayerLinks = fromPlayers
      .map((tp) => `[${tp.player.name}](${BASE_URL}/player/${tp.player.id})`)
      .join(", ");
    const toPlayerLinks = toPlayers
      .map((tp) => `[${tp.player.name}](${BASE_URL}/player/${tp.player.id})`)
      .join(", ");

    let actionPrefix: string;
    const tradeLink = `${BASE_URL}/trade/${tradeId}`;
    if (action === "proposed") {
      actionPrefix = `_[Trade Proposed](${tradeLink})_`;
    } else if (action === "accepted") {
      actionPrefix = `_[Trade Accepted](${tradeLink})_`;
    } else if (action === "rejected") {
      actionPrefix = `_[Trade Rejected](${tradeLink})_`;
    } else {
      actionPrefix = `_[Trade Cancelled](${tradeLink})_`;
    }

    let message = `${actionPrefix}: **[${trade.fromTeam.name}](${BASE_URL}/team/${trade.fromTeam.id})** `;
    if (fromPlayers.length > 0) {
      message += `sends ${fromPlayerLinks} `;
    }
    message += `↔ **[${trade.toTeam.name}](${BASE_URL}/team/${trade.toTeam.id})** `;
    if (toPlayers.length > 0) {
      message += `sends ${toPlayerLinks}`;
    }

    // Add proposal text if present (for proposed trades)
    if (trade.proposalText && action === "proposed") {
      const { context } = await resolveMentions(db, trade.proposalText);
      const proposalMarkdown = mentionsToMarkdown(
        trade.proposalText,
        context,
        BASE_URL,
      );
      if (proposalMarkdown) {
        message += `\n\n**Message from ${trade.fromTeam.name}:** ${proposalMarkdown}`;
      }
    }

    // Add response text if present (for accepted/rejected/cancelled trades)
    if (trade.responseText && action !== "proposed") {
      const { context } = await resolveMentions(db, trade.responseText);
      const responseMarkdown = mentionsToMarkdown(
        trade.responseText,
        context,
        BASE_URL,
      );
      if (responseMarkdown) {
        const responseLabel =
          action === "cancelled"
            ? `**Cancellation reason from ${trade.fromTeam.name}:**`
            : `**Response from ${trade.toTeam.name}:**`;
        message += `\n\n${responseLabel} ${responseMarkdown}`;
      }
    }

    await postEvent("trade", message);

    return { success: true };
  } catch (error) {
    console.error("Error creating trade event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create trade event",
    };
  }
};

/**
 * Creates a match state change event record
 * Works within an existing transaction or creates its own if needed
 */
export const createMatchStateChangeEvent = async (
  db: Database,
  userId: number,
  matchId: number,
  fromState: MatchState | null,
  toState: MatchState,
  seasonId: number,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const [event] = await db
      .insert(events)
      .values({
        eventType: "match_state_change",
        userId,
        seasonId,
      })
      .returning({ id: events.id });

    await db.insert(eventMatchStateChange).values({
      eventId: event.id,
      matchId,
      fromState,
      toState,
    });

    // Fetch match with teams for Discord message
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      with: {
        teamA: true,
        teamB: true,
      },
    });

    if (!match) {
      throw new Error("Match not found");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    let actionText: string;
    if (toState === "live") {
      actionText = `_Match Started_: **[${match.teamA.name}](${BASE_URL}/team/${match.teamA.id})** vs **[${match.teamB.name}](${BASE_URL}/team/${match.teamB.id})** is now **LIVE**!`;
    } else if (toState === "finished") {
      const scoreText =
        match.teamAScore !== null && match.teamBScore !== null
          ? ` Final score: **${match.teamAScore} - ${match.teamBScore}**`
          : "";
      actionText = `_Match Finished_: **[${match.teamA.name}](${BASE_URL}/team/${match.teamA.id})** vs **[${match.teamB.name}](${BASE_URL}/team/${match.teamB.id})** has ended.${scoreText}`;
    } else {
      actionText = `_Match State Change_: **[${match.teamA.name}](${BASE_URL}/team/${match.teamA.id})** vs **[${match.teamB.name}](${BASE_URL}/team/${match.teamB.id})** is now **${toState}**`;
    }

    await postEvent("match_state_change", actionText);

    return { success: true };
  } catch (error) {
    console.error("Error creating match state change event:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create match state change event",
    };
  }
};

export const createTradePreferencesUpdateEvent = async (
  db: Database,
  userId: number,
  teamId: number,
  seasonId: number,
  lookingFor: string | null,
  willingToTrade: string | null,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const [event] = await db
      .insert(events)
      .values({
        eventType: "trade_preferences_update",
        userId,
        seasonId,
      })
      .returning({ id: events.id });

    await db.insert(eventTradePreferencesUpdate).values({
      eventId: event.id,
      teamId,
      lookingFor,
      willingToTrade,
    });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error("Team not found");
    }

    const allText = [lookingFor, willingToTrade].filter(Boolean).join(" ");
    const { context } = await resolveMentions(db, allText);

    let message = `_Trade Preferences Updated_: **[${team.name}](${BASE_URL}/team/${team.id})**`;

    const lookingForMarkdown = mentionsToMarkdown(
      lookingFor,
      context,
      BASE_URL,
    );
    const willingToTradeMarkdown = mentionsToMarkdown(
      willingToTrade,
      context,
      BASE_URL,
    );

    if (lookingForMarkdown) {
      message += `\n\n**Looking For:** ${lookingForMarkdown}`;
    }
    if (willingToTradeMarkdown) {
      message += `\n\n**Willing to Trade:** ${willingToTradeMarkdown}`;
    }

    await postEvent("trade_preferences_update", message);

    return { success: true };
  } catch (error) {
    console.error("Error creating trade preferencs update event:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create trade preferencs update event",
    };
  }
};
