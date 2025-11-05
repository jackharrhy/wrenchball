import { eq, sql, asc } from "drizzle-orm";
import { TEAM_SIZE } from "~/consts";
import { database } from "~/database/context";
import {
  players,
  season,
  teams,
  usersSeasons,
  users,
  type SeasonState,
} from "~/database/schema";
import { getSeasonState } from "./admin";

/**
 * Validates that a player can be drafted by a user
 */
export const validateDraftPick = async (
  db: ReturnType<typeof database>,
  userId: number,
  playerId: number
): Promise<{ valid: boolean; error?: string }> => {
  // 1. Check season is in drafting state
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { valid: false, error: "No active season found" };
  }

  if (seasonState.state !== "drafting") {
    return {
      valid: false,
      error: `Season is in "${seasonState.state}" state, not drafting`,
    };
  }

  // 2. Check it's the user's turn
  if (seasonState.currentDraftingUserId !== userId) {
    return { valid: false, error: "It is not your turn to draft" };
  }

  // 3. Check player exists and is a free agent
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) {
    return { valid: false, error: "Player not found" };
  }

  if (player[0].teamId !== null) {
    return { valid: false, error: "Player is already assigned to a team" };
  }

  // 4. Check user hasn't exceeded team size limit
  const userTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, userId))
    .limit(1);

  if (userTeam.length === 0) {
    return { valid: false, error: "User does not have a team" };
  }

  const teamPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.teamId, userTeam[0].id));

  if (teamPlayers.length >= TEAM_SIZE) {
    return {
      valid: false,
      error: `Team already has ${TEAM_SIZE} players (maximum allowed)`,
    };
  }

  return { valid: true };
};

/**
 * Drafts a player for a user and advances to the next drafter
 */
export const draftPlayer = async (
  db: ReturnType<typeof database>,
  userId: number,
  playerId: number
): Promise<{ success: boolean; error?: string }> => {
  // Validate the draft pick
  const validation = await validateDraftPick(db, userId, playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  await db.transaction(async (tx) => {
    // Get user's team
    const userTeam = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.userId, userId))
      .limit(1);

    if (userTeam.length === 0) {
      throw new Error("User team not found");
    }

    // Assign player to team
    await tx
      .update(players)
      .set({ teamId: userTeam[0].id })
      .where(eq(players.id, playerId));

    // Advance to next drafter
    await advanceToNextDrafter(tx, userId);
  });

  return { success: true };
};

/**
 * Advances the draft to the next user in the drafting order
 * Implements snake draft: forward, then reverse, then forward, etc.
 *
 * Example with 3 users (A, B, C):
 * Round 1 (forward): A picks, B picks, C picks
 * Round 2 (reverse): C picks, B picks, A picks
 * Round 3 (forward): A picks, B picks, C picks
 */
const advanceToNextDrafter = async (
  db: ReturnType<typeof database>,
  currentUserId: number
): Promise<void> => {
  // Get season state within the transaction
  const seasonState = await db
    .select()
    .from(season)
    .where(eq(season.id, 1))
    .limit(1);

  const currentSeason = seasonState[0];
  if (!currentSeason || currentSeason.state !== "drafting") {
    throw new Error("Season is not in drafting state");
  }

  // Get drafting order within the transaction
  const draftingOrderRows = await db
    .select({
      userId: usersSeasons.userId,
      userName: users.name,
      draftingTurn: usersSeasons.draftingTurn,
    })
    .from(usersSeasons)
    .innerJoin(users, eq(usersSeasons.userId, users.id))
    .where(eq(usersSeasons.seasonId, currentSeason.id))
    .orderBy(asc(usersSeasons.draftingTurn));

  if (draftingOrderRows.length === 0) {
    throw new Error("No users in drafting order");
  }

  // Count total picks made (including the one that was just made)
  // After assigning a player, count how many players are now on teams
  const draftedPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(sql`${players.teamId} IS NOT NULL`);

  const totalPicksMade = draftedPlayers.length;

  // Calculate which round we're in (0-indexed: 0, 1, 2, ...)
  // Round 0: forward (0, 1, 2, ..., n-1)
  // Round 1: reverse (n-1, n-2, ..., 1, 0)
  // Round 2: forward (0, 1, 2, ..., n-1)
  const roundNumber = Math.floor(totalPicksMade / draftingOrderRows.length);
  const positionInNextRound = totalPicksMade % draftingOrderRows.length;

  let nextIndex: number;

  if (roundNumber % 2 === 0) {
    // Forward round: 0, 1, 2, ..., n-1
    nextIndex = positionInNextRound;
  } else {
    // Reverse round: n-1, n-2, ..., 1, 0
    nextIndex = draftingOrderRows.length - 1 - positionInNextRound;
  }

  const nextUserId = draftingOrderRows[nextIndex].userId;

  // Update season state with next drafter
  await db
    .update(season)
    .set({ currentDraftingUserId: nextUserId })
    .where(eq(season.id, 1));
};
