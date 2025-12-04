import { PlayerIcon } from "~/components/PlayerIcon";
import { TeamLogo } from "~/components/TeamLogo";
import type { Player, Team } from "~/database/schema";

// Types for resolved mention data
export type MentionedPlayer = Pick<
  Player,
  "id" | "name" | "imageUrl" | "statsCharacter"
>;
export type MentionedTeam = Pick<Team, "id" | "name" | "abbreviation"> & {
  captainStatsCharacter?: string | null;
};

export interface MentionContext {
  players: Map<number, MentionedPlayer>;
  teams: Map<number, MentionedTeam>;
}

/**
 * Extract all player and team IDs from text containing mention tokens
 */
export function extractMentionIds(text: string): {
  playerIds: number[];
  teamIds: number[];
} {
  const playerIds: number[] = [];
  const teamIds: number[] = [];

  const PLAYER_MENTION_REGEX = /<@(\d+)>/g;
  const TEAM_MENTION_REGEX = /<#(\d+)>/g;

  let match;
  while ((match = PLAYER_MENTION_REGEX.exec(text)) !== null) {
    playerIds.push(parseInt(match[1], 10));
  }

  while ((match = TEAM_MENTION_REGEX.exec(text)) !== null) {
    teamIds.push(parseInt(match[1], 10));
  }

  return {
    playerIds: [...new Set(playerIds)],
    teamIds: [...new Set(teamIds)],
  };
}

/**
 * Create an empty mention context
 */
export function createEmptyContext(): MentionContext {
  return {
    players: new Map(),
    teams: new Map(),
  };
}

/**
 * Merge multiple mention contexts into one
 */
export function mergeContexts(...contexts: MentionContext[]): MentionContext {
  const merged = createEmptyContext();
  for (const ctx of contexts) {
    for (const [id, player] of ctx.players) {
      merged.players.set(id, player);
    }
    for (const [id, team] of ctx.teams) {
      merged.teams.set(id, team);
    }
  }
  return merged;
}

interface TextSegment {
  type: "text" | "player" | "team";
  content: string;
  id?: number;
}

/**
 * Parse text with mention tokens into segments
 */
function parseTextToSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const combinedRegex = /<@(\d+)>|<#(\d+)>/g;

  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }

    if (match[1] !== undefined) {
      // Player mention <@id>
      segments.push({
        type: "player",
        content: match[0],
        id: parseInt(match[1], 10),
      });
    } else if (match[2] !== undefined) {
      // Team mention <#id>
      segments.push({
        type: "team",
        content: match[0],
        id: parseInt(match[2], 10),
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Render text content with newlines as React nodes
 */
function renderTextWithNewlines(
  content: string,
  keyPrefix: string,
): React.ReactNode[] {
  const lines = content.split("\n");
  const result: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (i > 0) {
      result.push(<br key={`${keyPrefix}-br-${i}`} />);
    }
    if (line) {
      result.push(<span key={`${keyPrefix}-text-${i}`}>{line}</span>);
    }
  });

  return result;
}

/**
 * Render text with mention tokens as React nodes
 * Mentions are rendered as clickable links with PlayerIcon/TeamLogo
 */
export function renderMentionedText(
  text: string | null | undefined,
  context: MentionContext,
): React.ReactNode {
  if (!text) return null;

  const segments = parseTextToSegments(text);

  return segments.flatMap((segment, index) => {
    if (segment.type === "text") {
      return renderTextWithNewlines(segment.content, `seg-${index}`);
    }

    if (segment.type === "player" && segment.id !== undefined) {
      const player = context.players.get(segment.id);
      if (!player) {
        return (
          <span key={index} className="text-red-500">
            UNKNOWN PLAYER
          </span>
        );
      }
      return (
        <a
          key={index}
          href={`/player/${player.id}`}
          className="inline-flex items-center gap-0.5 pl-1 pr-2 translate-y-[0.16rem] rounded bg-orange-600/30 text-orange-300 hover:bg-orange-600/50"
        >
          <PlayerIcon player={player} size="xs" />
          <span>{player.name}</span>
        </a>
      );
    }

    if (segment.type === "team" && segment.id !== undefined) {
      const team = context.teams.get(segment.id);
      if (!team) {
        return (
          <span key={index} className="text-red-500">
            UNKNOWN TEAM
          </span>
        );
      }
      return (
        <a
          key={index}
          href={`/team/${team.id}`}
          className="inline-flex items-center gap-0.5 px-1 translate-y-[0.16rem] rounded bg-green-600/30 text-green-300 hover:bg-green-600/50"
        >
          {team.captainStatsCharacter && (
            <TeamLogo
              captainStatsCharacter={team.captainStatsCharacter}
              size="xs"
            />
          )}
          <span>{team.name}</span>
        </a>
      );
    }

    return null;
  });
}

/**
 * Convert text with mention tokens to markdown with links (for Discord)
 */
export function mentionsToMarkdown(
  text: string | null | undefined,
  context: MentionContext,
  baseUrl: string,
): string {
  if (!text) return "";

  const segments = parseTextToSegments(text);

  return segments
    .map((segment) => {
      if (segment.type === "text") {
        return segment.content;
      }

      if (segment.type === "player" && segment.id !== undefined) {
        const player = context.players.get(segment.id);
        if (!player) return "@Unknown";
        return `[${player.name}](${baseUrl}/player/${player.id})`;
      }

      if (segment.type === "team" && segment.id !== undefined) {
        const team = context.teams.get(segment.id);
        if (!team) return "#Unknown";
        return `[${team.name}](${baseUrl}/team/${team.id})`;
      }

      return "";
    })
    .join("");
}
