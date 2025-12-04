import { inArray } from "drizzle-orm";
import type { Database } from "~/database/db";
import { players, teams } from "~/database/schema";
import {
  extractMentionIds,
  createEmptyContext,
  mergeContexts,
  type MentionContext,
  type MentionedPlayer,
  type MentionedTeam,
} from "./mentions";

/**
 * Resolve all mentions in a text string by fetching player/team data from the database
 */
export async function resolveMentions(
  db: Database,
  text: string | null | undefined,
): Promise<{ text: string | null; context: MentionContext }> {
  if (!text) {
    return { text: null, context: createEmptyContext() };
  }

  const { playerIds, teamIds } = extractMentionIds(text);

  const context = createEmptyContext();

  // Fetch players if any are mentioned
  if (playerIds.length > 0) {
    const mentionedPlayers = await db
      .select({
        id: players.id,
        name: players.name,
        imageUrl: players.imageUrl,
        statsCharacter: players.statsCharacter,
      })
      .from(players)
      .where(inArray(players.id, playerIds));

    for (const player of mentionedPlayers) {
      context.players.set(player.id, player as MentionedPlayer);
    }
  }

  // Fetch teams if any are mentioned (with captain for logo)
  if (teamIds.length > 0) {
    const mentionedTeams = await db.query.teams.findMany({
      where: inArray(teams.id, teamIds),
      columns: {
        id: true,
        name: true,
        abbreviation: true,
      },
      with: {
        captain: {
          columns: {
            statsCharacter: true,
          },
        },
      },
    });

    for (const team of mentionedTeams) {
      context.teams.set(team.id, {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        captainStatsCharacter: team.captain?.statsCharacter ?? null,
      } as MentionedTeam);
    }
  }

  return { text, context };
}

/**
 * Resolve mentions from multiple text fields and merge contexts
 */
export async function resolveMentionsMultiple(
  db: Database,
  texts: (string | null | undefined)[],
): Promise<{
  contexts: MentionContext[];
  mergedContext: MentionContext;
}> {
  const results = await Promise.all(
    texts.map((text) => resolveMentions(db, text)),
  );

  const contexts = results.map((r) => r.context);
  const mergedContext = mergeContexts(...contexts);

  return { contexts, mergedContext };
}
