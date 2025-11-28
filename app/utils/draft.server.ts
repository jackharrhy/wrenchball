import { eq, sql, asc } from "drizzle-orm";
import { TEAM_SIZE, LINEUP_SIZE } from "~/consts";
import { type Database } from "~/database/db";
import {
  players,
  season,
  teams,
  usersSeasons,
  users,
  teamLineups,
  stats,
  type FieldingPosition,
} from "~/database/schema";
import { getSeasonState } from "./admin.server";
import { createDraftEvent } from "./events.server";

export const validateDraftPick = async (
  db: Database,
  userId: number,
  playerId: number,
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

  /*
  TODO we need to ensure if the player that has been picked is a captain, and this pick
  might make it impossible for another team to have a captain, we deny the draft such that
  the other team can draft a captain.

  We must also ensure, if this is the _last_ pick for a team, and the pick isn't a captain,
  we deny the draft such that the player _has_ to draft a captain to complete the team.
  */

  return { valid: true };
};

/**
 * Adds a player to the team lineup if there's space, randomly assigning
 * fielding position and batting order
 */
const addPlayerToLineup = async (
  db: Database,
  teamId: number,
  playerId: number,
  { shouldStar = false }: { shouldStar?: boolean } = {},
): Promise<void> => {
  // Get current lineup entries for this team
  const currentLineup = await db
    .select({
      fieldingPosition: teamLineups.fieldingPosition,
      battingOrder: teamLineups.battingOrder,
    })
    .from(teamLineups)
    .innerJoin(players, eq(teamLineups.playerId, players.id))
    .where(eq(players.teamId, teamId));

  // If lineup is already full, don't add
  if (currentLineup.length >= LINEUP_SIZE) {
    return;
  }

  // Get all possible fielding positions
  const allFieldingPositions: FieldingPosition[] = [
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "LF",
    "CF",
    "RF",
    "P",
  ];

  // Get used fielding positions and batting orders
  const usedFieldingPositions = new Set(
    currentLineup
      .map((entry) => entry.fieldingPosition)
      .filter((pos): pos is FieldingPosition => pos !== null),
  );
  const usedBattingOrders = new Set(
    currentLineup
      .map((entry) => entry.battingOrder)
      .filter((order): order is number => order !== null),
  );

  // Find available fielding positions and batting orders
  const availableFieldingPositions = allFieldingPositions.filter(
    (pos) => !usedFieldingPositions.has(pos),
  );
  const availableBattingOrders = Array.from(
    { length: LINEUP_SIZE },
    (_, i) => i + 1,
  ).filter((order) => !usedBattingOrders.has(order));

  // If no available positions or batting orders, don't add
  if (
    availableFieldingPositions.length === 0 ||
    availableBattingOrders.length === 0
  ) {
    return;
  }

  // Randomly select from available options
  const randomFieldingPosition =
    availableFieldingPositions[
      Math.floor(Math.random() * availableFieldingPositions.length)
    ];
  const randomBattingOrder =
    availableBattingOrders[
      Math.floor(Math.random() * availableBattingOrders.length)
    ];

  // Insert into lineup
  await db.insert(teamLineups).values({
    playerId,
    fieldingPosition: randomFieldingPosition,
    battingOrder: randomBattingOrder,
    isStarred: shouldStar,
  });
};

/**
 * Drafts a player for a user and advances to the next drafter
 */
export const draftPlayer = async (
  db: Database,
  userId: number,
  playerId: number,
  skipAutoDraft = false,
): Promise<{ success: boolean; error?: string }> => {
  const validation = await validateDraftPick(db, userId, playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  await db.transaction(async (tx) => {
    const userTeam = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.userId, userId))
      .limit(1);

    if (userTeam.length === 0) {
      throw new Error("User team not found");
    }

    const teamPlayers = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.teamId, userTeam[0].id));

    const shouldStar = teamPlayers.length === 0;

    await tx
      .update(players)
      .set({ teamId: userTeam[0].id })
      .where(eq(players.id, playerId));

    // Check if team has a captain, and if this player can be a captain
    const [teamData, playerData] = await Promise.all([
      tx
        .select({ captainId: teams.captainId })
        .from(teams)
        .where(eq(teams.id, userTeam[0].id))
        .limit(1),
      tx
        .select({ statsCharacter: players.statsCharacter })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1),
    ]);

    // Only set as captain if: team has no captain AND player has stats AND stats.captain is true
    if (
      teamData.length > 0 &&
      teamData[0].captainId === null &&
      playerData.length > 0 &&
      playerData[0].statsCharacter
    ) {
      const playerStats = await tx
        .select({ captain: stats.captain })
        .from(stats)
        .where(eq(stats.character, playerData[0].statsCharacter))
        .limit(1);

      if (playerStats.length > 0 && playerStats[0].captain === true) {
        await tx
          .update(teams)
          .set({ captainId: playerId })
          .where(eq(teams.id, userTeam[0].id));
      }
    }

    // Add player to lineup if there's space
    await addPlayerToLineup(tx, userTeam[0].id, playerId, { shouldStar });

    const seasonState = await getSeasonState(tx);
    if (!seasonState) {
      throw new Error("Season state not found");
    }
    const eventResult = await createDraftEvent(
      tx,
      userId,
      playerId,
      userTeam[0].id,
      seasonState.id,
    );
    if (!eventResult.success) {
      throw new Error("Failed to create draft event");
    }

    // Clear pre-draft selections for this player from all users
    await clearPreDraftForPlayer(tx, playerId);

    await advanceToNextDrafter(tx, userId, skipAutoDraft);
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
  db: Database,
  currentUserId: number,
  skipAutoDraft = false,
): Promise<void> => {
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

  // Check if the next user has a pre-draft and auto-draft it (unless we're already in auto-draft)
  if (!skipAutoDraft) {
    const preDraftPlayerId = await getPreDraft(db, nextUserId);
    if (preDraftPlayerId) {
      // Verify player is still available before auto-drafting
      const player = await db
        .select()
        .from(players)
        .where(eq(players.id, preDraftPlayerId))
        .limit(1);

      if (player.length > 0 && player[0].teamId === null) {
        // Player is still available, attempt to draft with skipAutoDraft=true to prevent infinite loop
        const result = await draftPlayer(
          db,
          nextUserId,
          preDraftPlayerId,
          true,
        );
        if (!result.success) {
          // Failed to auto-draft, clear the pre-draft
          await clearPreDraft(db, nextUserId);
        }
        // Note: If successful, draftPlayer already cleared the pre-draft via clearPreDraftForPlayer
      } else {
        // Player was already taken, clear the pre-draft
        await clearPreDraft(db, nextUserId);
      }
    }
  }
};

/**
 * Sets a pre-draft selection for a user
 */
export const setPreDraft = async (
  db: Database,
  userId: number,
  playerId: number,
): Promise<{ success: boolean; error?: string }> => {
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { success: false, error: "No active season found" };
  }

  if (seasonState.state !== "drafting") {
    return {
      success: false,
      error: `Season is in "${seasonState.state}" state, not drafting`,
    };
  }

  // Check player exists and is a free agent
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) {
    return { success: false, error: "Player not found" };
  }

  if (player[0].teamId !== null) {
    return { success: false, error: "Player is already assigned to a team" };
  }

  // Update the user's pre-draft selection
  await db
    .update(usersSeasons)
    .set({ preDraftPlayerId: playerId })
    .where(
      sql`${usersSeasons.userId} = ${userId} AND ${usersSeasons.seasonId} = ${seasonState.id}`,
    );

  return { success: true };
};

/**
 * Clears a pre-draft selection for a user
 */
export const clearPreDraft = async (
  db: Database,
  userId: number,
): Promise<{ success: boolean; error?: string }> => {
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { success: false, error: "No active season found" };
  }

  await db
    .update(usersSeasons)
    .set({ preDraftPlayerId: null })
    .where(
      sql`${usersSeasons.userId} = ${userId} AND ${usersSeasons.seasonId} = ${seasonState.id}`,
    );

  return { success: true };
};

/**
 * Gets the pre-draft selection for a user
 */
export const getPreDraft = async (
  db: Database,
  userId: number,
): Promise<number | null> => {
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return null;
  }

  const userSeason = await db
    .select({ preDraftPlayerId: usersSeasons.preDraftPlayerId })
    .from(usersSeasons)
    .where(
      sql`${usersSeasons.userId} = ${userId} AND ${usersSeasons.seasonId} = ${seasonState.id}`,
    )
    .limit(1);

  if (userSeason.length === 0) {
    return null;
  }

  return userSeason[0].preDraftPlayerId;
};

/**
 * Clears pre-draft selections for all users if the player is the pre-drafted player
 */
export const clearPreDraftForPlayer = async (
  db: Database,
  playerId: number,
): Promise<void> => {
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return;
  }

  await db
    .update(usersSeasons)
    .set({ preDraftPlayerId: null })
    .where(
      sql`${usersSeasons.preDraftPlayerId} = ${playerId} AND ${usersSeasons.seasonId} = ${seasonState.id}`,
    );
};

/**
 * Attempts to auto-draft for a user if they have a pre-draft selection
 * This should be called when it becomes a user's turn
 */
export const attemptAutoDraft = async (
  db: Database,
  userId: number,
): Promise<{ autoDrafted: boolean; playerId?: number; error?: string }> => {
  const preDraftPlayerId = await getPreDraft(db, userId);

  if (!preDraftPlayerId) {
    return { autoDrafted: false };
  }

  // Check if the pre-drafted player is still available
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, preDraftPlayerId))
    .limit(1);

  if (player.length === 0 || player[0].teamId !== null) {
    // Player was already drafted, clear the pre-draft
    await clearPreDraft(db, userId);
    return {
      autoDrafted: false,
      error: "Pre-drafted player was already taken",
    };
  }

  // Attempt to draft the player
  const result = await draftPlayer(db, userId, preDraftPlayerId);

  if (result.success) {
    return { autoDrafted: true, playerId: preDraftPlayerId };
  } else {
    // Failed to draft, clear pre-draft
    await clearPreDraft(db, userId);
    return {
      autoDrafted: false,
      error: result.error,
    };
  }
};

/**
 * Sets a player as starred for a user's team
 * Only one player per team can be starred at a time
 */
export const setPlayerStarred = async (
  db: Database,
  userId: number,
  playerId: number,
): Promise<{ success: boolean; error?: string }> => {
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { success: false, error: "No active season found" };
  }

  if (seasonState.state !== "drafting") {
    return {
      success: false,
      error: `Season is in "${seasonState.state}" state, not drafting`,
    };
  }

  // Get user's team
  const userTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, userId))
    .limit(1);

  if (userTeam.length === 0) {
    return { success: false, error: "User does not have a team" };
  }

  const teamId = userTeam[0].id;

  // Verify player exists and belongs to user's team
  const player = await db
    .select({ id: players.id, teamId: players.teamId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) {
    return { success: false, error: "Player not found" };
  }

  if (player[0].teamId !== teamId) {
    return {
      success: false,
      error: "Player does not belong to your team",
    };
  }

  await db.transaction(async (tx) => {
    // Check if player is already starred
    const existingLineup = await tx
      .select({ isStarred: teamLineups.isStarred })
      .from(teamLineups)
      .where(eq(teamLineups.playerId, playerId))
      .limit(1);

    const isCurrentlyStarred =
      existingLineup.length > 0 && existingLineup[0].isStarred === true;

    if (isCurrentlyStarred) {
      // Toggle: unstar the player
      await tx
        .update(teamLineups)
        .set({ isStarred: false })
        .where(eq(teamLineups.playerId, playerId));
    } else {
      // Star the selected player and unstar all others
      // Get all players on the team
      const teamPlayers = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, teamId));

      // Unstar all players on the team
      for (const teamPlayer of teamPlayers) {
        const teamPlayerLineup = await tx
          .select()
          .from(teamLineups)
          .where(eq(teamLineups.playerId, teamPlayer.id))
          .limit(1);

        if (teamPlayerLineup.length > 0) {
          await tx
            .update(teamLineups)
            .set({ isStarred: false })
            .where(eq(teamLineups.playerId, teamPlayer.id));
        }
      }

      // Star the selected player
      if (existingLineup.length > 0) {
        // Update existing entry
        await tx
          .update(teamLineups)
          .set({ isStarred: true })
          .where(eq(teamLineups.playerId, playerId));
      } else {
        // Insert new entry (player might not be in lineup yet)
        await tx.insert(teamLineups).values({
          playerId,
          isStarred: true,
          fieldingPosition: null,
          battingOrder: null,
        });
      }
    }
  });

  return { success: true };
};
