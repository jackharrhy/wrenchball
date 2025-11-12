import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { TEAM_SIZE, LINEUP_SIZE } from "~/consts";
import { database } from "~/database/context";
import {
  trades,
  tradePlayers,
  players,
  teams,
  teamLineups,
  users,
  type Trade,
  type TradePlayer,
} from "~/database/schema";
import { getSeasonState } from "./admin";

export interface CreateTradeRequestParams {
  fromUserId: number;
  toUserId: number;
  fromPlayerIds: number[];
  toPlayerIds: number[];
}

export interface TradeWithPlayers extends Trade {
  fromUser: { id: number; name: string };
  toUser: { id: number; name: string };
  tradePlayers: Array<{
    tradePlayer: TradePlayer;
    player: {
      id: number;
      name: string;
      imageUrl: string | null;
      statsCharacter: string | null;
    };
    fromTeam: { id: number; name: string };
    toTeam: { id: number; name: string };
  }>;
}

export const validateTradeRequest = async (
  db: ReturnType<typeof database>,
  params: CreateTradeRequestParams,
  excludeTradeId?: number
): Promise<{ valid: boolean; error?: string }> => {
  const { fromUserId, toUserId, fromPlayerIds, toPlayerIds } = params;

  // 1. Check season is in playing state
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { valid: false, error: "No active season found" };
  }

  if (seasonState.state !== "playing") {
    return {
      valid: false,
      error: `Season is in "${seasonState.state}" state, trading is only available during playing state`,
    };
  }

  // 2. Prevent trading with yourself
  if (fromUserId === toUserId) {
    return { valid: false, error: "Cannot trade with yourself" };
  }

  // 3. Validate that both users have teams
  const fromUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, fromUserId))
    .limit(1);

  if (fromUserTeam.length === 0) {
    return { valid: false, error: "You do not have a team" };
  }

  const toUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, toUserId))
    .limit(1);

  if (toUserTeam.length === 0) {
    return { valid: false, error: "Other user does not have a team" };
  }

  const fromTeamId = fromUserTeam[0].id;
  const toTeamId = toUserTeam[0].id;

  const [fromTeamPlayers, toTeamPlayers] = await Promise.all([
    db
      .select({ id: players.id, teamId: players.teamId })
      .from(players)
      .where(eq(players.teamId, fromTeamId)),
    db
      .select({ id: players.id, teamId: players.teamId })
      .from(players)
      .where(eq(players.teamId, toTeamId)),
  ]);

  const fromTeamPlayerIds = new Set(fromTeamPlayers.map((p) => p.id));
  const toTeamPlayerIds = new Set(toTeamPlayers.map((p) => p.id));

  // 4. Validate players exist and belong to correct teams
  if (fromPlayerIds.length === 0 && toPlayerIds.length === 0) {
    return { valid: false, error: "Must trade at least one player" };
  }

  // Check from players belong to from user's team
  if (fromPlayerIds.length > 0) {
    for (const playerId of fromPlayerIds) {
      if (!fromTeamPlayerIds.has(playerId)) {
        return {
          valid: false,
          error: "Some players do not belong to your team",
        };
      }
    }
  }

  // Check to players belong to to user's team
  if (toPlayerIds.length > 0) {
    for (const playerId of toPlayerIds) {
      if (!toTeamPlayerIds.has(playerId)) {
        return {
          valid: false,
          error: "Some players do not belong to the other team",
        };
      }
    }
  }

  // 5. Check if any players are already in pending trades with the same users
  // We only need to block if the SPECIFIC players are in pending trades involving either fromUserId or toUserId
  const allPlayerIds = [...fromPlayerIds, ...toPlayerIds];
  if (allPlayerIds.length > 0) {
    const whereConditions = [
      eq(trades.status, "pending"),
      inArray(tradePlayers.playerId, allPlayerIds),
      // Only check trades involving the same users
      or(
        eq(trades.fromUserId, fromUserId),
        eq(trades.toUserId, fromUserId),
        eq(trades.fromUserId, toUserId),
        eq(trades.toUserId, toUserId)
      ),
    ];

    // Exclude the current trade if we're validating an existing trade (e.g., when accepting)
    if (excludeTradeId !== undefined) {
      whereConditions.push(sql`${trades.id} != ${excludeTradeId}`);
    }

    const pendingTradesWithPlayers = await db
      .select({
        playerId: tradePlayers.playerId,
        fromUserId: trades.fromUserId,
        toUserId: trades.toUserId,
      })
      .from(tradePlayers)
      .innerJoin(trades, eq(tradePlayers.tradeId, trades.id))
      .where(and(...whereConditions));

    // Group by player to see which specific players are already in pending trades
    const playersInPendingTrades = new Set(
      pendingTradesWithPlayers.map((p) => p.playerId)
    );

    // Check if any of the players we're trying to trade are already in pending trades
    const conflictingPlayers = allPlayerIds.filter((playerId) =>
      playersInPendingTrades.has(playerId)
    );

    if (conflictingPlayers.length > 0) {
      return {
        valid: false,
        error:
          "Some players are already involved in pending trades with this user",
      };
    }
  }

  // 6. Check team sizes after trade
  const [fromTeamPlayersAfterTrade, toTeamPlayersAfterTrade] =
    await Promise.all([
      db
        .select({ id: players.id, teamId: players.teamId })
        .from(players)
        .where(eq(players.teamId, fromTeamId)),
      db
        .select({ id: players.id, teamId: players.teamId })
        .from(players)
        .where(eq(players.teamId, toTeamId)),
    ]);

  if (fromTeamPlayersAfterTrade.length > TEAM_SIZE) {
    return {
      valid: false,
      error: `Trade would exceed maximum team size of ${TEAM_SIZE}`,
    };
  }

  if (toTeamPlayersAfterTrade.length > TEAM_SIZE) {
    return {
      valid: false,
      error: `Trade would exceed other team's maximum size of ${TEAM_SIZE}`,
    };
  }

  if (fromTeamPlayersAfterTrade.length < LINEUP_SIZE) {
    return {
      valid: false,
      error: `Trade would leave your team with less than ${LINEUP_SIZE} players (minimum required for lineup)`,
    };
  }

  if (toTeamPlayersAfterTrade.length < LINEUP_SIZE) {
    return {
      valid: false,
      error: `Trade would leave other team with less than ${LINEUP_SIZE} players (minimum required for lineup)`,
    };
  }

  return { valid: true };
};

export const createTradeRequest = async (
  db: ReturnType<typeof database>,
  params: CreateTradeRequestParams
): Promise<{ success: boolean; error?: string; tradeId?: number }> => {
  const validation = await validateTradeRequest(db, params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { fromUserId, toUserId, fromPlayerIds, toPlayerIds } = params;

  const fromUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, fromUserId))
    .limit(1);

  const toUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, toUserId))
    .limit(1);

  const fromTeamId = fromUserTeam[0].id;
  const toTeamId = toUserTeam[0].id;

  let tradeId: number | undefined;

  await db.transaction(async (tx) => {
    // Create trade
    const [newTrade] = await tx
      .insert(trades)
      .values({
        fromUserId,
        toUserId,
        status: "pending",
      })
      .returning({ id: trades.id });

    tradeId = newTrade.id;

    // Create trade player entries for from players
    if (fromPlayerIds.length > 0) {
      await tx.insert(tradePlayers).values(
        fromPlayerIds.map((playerId) => ({
          tradeId: newTrade.id,
          playerId,
          fromTeamId,
          toTeamId,
        }))
      );
    }

    // Create trade player entries for to players
    if (toPlayerIds.length > 0) {
      await tx.insert(tradePlayers).values(
        toPlayerIds.map((playerId) => ({
          tradeId: newTrade.id,
          playerId,
          fromTeamId: toTeamId,
          toTeamId: fromTeamId,
        }))
      );
    }
  });

  if (!tradeId) {
    return { success: false, error: "Failed to create trade" };
  }

  return { success: true, tradeId };
};

export const acceptTrade = async (
  db: ReturnType<typeof database>,
  tradeId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> => {
  const trade = await db
    .select()
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);

  if (trade.length === 0) {
    return { success: false, error: "Trade not found" };
  }

  const tradeData = trade[0];

  if (tradeData.status !== "pending") {
    return { success: false, error: "Trade is not pending" };
  }

  if (tradeData.toUserId !== userId) {
    return { success: false, error: "You are not the recipient of this trade" };
  }

  const tradePlayerData = await db
    .select()
    .from(tradePlayers)
    .where(eq(tradePlayers.tradeId, tradeId));

  if (tradePlayerData.length === 0) {
    return { success: false, error: "Trade has no players" };
  }

  const fromUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, tradeData.fromUserId))
    .limit(1);

  const toUserTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.userId, tradeData.toUserId))
    .limit(1);

  const fromTeamId = fromUserTeam[0].id;
  const toTeamId = toUserTeam[0].id;

  const fromPlayerIds = tradePlayerData
    .filter((tp) => tp.fromTeamId === fromTeamId)
    .map((tp) => tp.playerId);
  const toPlayerIds = tradePlayerData
    .filter((tp) => tp.fromTeamId === toTeamId)
    .map((tp) => tp.playerId);

  const validation = await validateTradeRequest(
    db,
    {
      fromUserId: tradeData.fromUserId,
      toUserId: tradeData.toUserId,
      fromPlayerIds,
      toPlayerIds,
    },
    tradeId
  );

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  await db.transaction(async (tx) => {
    const allPlayerIds = [...fromPlayerIds, ...toPlayerIds];
    if (allPlayerIds.length > 0) {
      await tx
        .delete(teamLineups)
        .where(inArray(teamLineups.playerId, allPlayerIds));
    }

    if (fromPlayerIds.length > 0) {
      await tx
        .update(players)
        .set({ teamId: toTeamId })
        .where(inArray(players.id, fromPlayerIds));
    }

    if (toPlayerIds.length > 0) {
      await tx
        .update(players)
        .set({ teamId: fromTeamId })
        .where(inArray(players.id, toPlayerIds));
    }

    await tx
      .update(trades)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(trades.id, tradeId));
  });

  return { success: true };
};

export const denyTrade = async (
  db: ReturnType<typeof database>,
  tradeId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> => {
  const trade = await db
    .select()
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);

  if (trade.length === 0) {
    return { success: false, error: "Trade not found" };
  }

  const tradeData = trade[0];

  if (tradeData.status !== "pending") {
    return { success: false, error: "Trade is not pending" };
  }

  if (tradeData.toUserId !== userId) {
    return { success: false, error: "You are not the recipient of this trade" };
  }

  await db
    .update(trades)
    .set({ status: "denied", updatedAt: new Date() })
    .where(eq(trades.id, tradeId));

  return { success: true };
};

export const getTradesForUser = async (
  db: ReturnType<typeof database>,
  userId: number
): Promise<TradeWithPlayers[]> => {
  const userTrades = await db
    .select()
    .from(trades)
    .where(or(eq(trades.fromUserId, userId), eq(trades.toUserId, userId)))
    .orderBy(desc(trades.createdAt));

  if (userTrades.length === 0) {
    return [];
  }

  const userIds = new Set<number>();
  for (const trade of userTrades) {
    userIds.add(trade.fromUserId);
    userIds.add(trade.toUserId);
  }

  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, Array.from(userIds)));

  const usersById = new Map(allUsers.map((u) => [u.id, u]));

  const tradeIds = userTrades.map((t) => t.id);
  const allTradePlayers = await db
    .select({
      tradePlayer: tradePlayers,
      player: {
        id: players.id,
        name: players.name,
        imageUrl: players.imageUrl,
        statsCharacter: players.statsCharacter,
      },
      fromTeam: {
        id: teams.id,
        name: teams.name,
      },
    })
    .from(tradePlayers)
    .innerJoin(players, eq(tradePlayers.playerId, players.id))
    .innerJoin(teams, eq(tradePlayers.fromTeamId, teams.id))
    .where(inArray(tradePlayers.tradeId, tradeIds));

  const toTeamIds = new Set(
    allTradePlayers.map((tp) => tp.tradePlayer.toTeamId)
  );
  const toTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, Array.from(toTeamIds)));
  const toTeamsById = new Map(toTeams.map((t) => [t.id, t]));

  const tradePlayersByTradeId = new Map<
    number,
    Array<{
      tradePlayer: TradePlayer;
      player: {
        id: number;
        name: string;
        imageUrl: string | null;
        statsCharacter: string | null;
      };
      fromTeam: { id: number; name: string };
      toTeam: { id: number; name: string };
    }>
  >();
  for (const tp of allTradePlayers) {
    if (!tradePlayersByTradeId.has(tp.tradePlayer.tradeId)) {
      tradePlayersByTradeId.set(tp.tradePlayer.tradeId, []);
    }
    const toTeam = toTeamsById.get(tp.tradePlayer.toTeamId);
    if (toTeam) {
      tradePlayersByTradeId.get(tp.tradePlayer.tradeId)!.push({
        tradePlayer: tp.tradePlayer,
        player: tp.player,
        fromTeam: tp.fromTeam,
        toTeam,
      });
    }
  }

  return userTrades.map((trade) => ({
    ...trade,
    fromUser: usersById.get(trade.fromUserId)!,
    toUser: usersById.get(trade.toUserId)!,
    tradePlayers: tradePlayersByTradeId.get(trade.id) || [],
  }));
};

export const getPendingTradesForUser = async (
  db: ReturnType<typeof database>,
  userId: number
): Promise<TradeWithPlayers[]> => {
  const pendingTrades = await db
    .select()
    .from(trades)
    .where(and(eq(trades.toUserId, userId), eq(trades.status, "pending")))
    .orderBy(desc(trades.createdAt));

  if (pendingTrades.length === 0) {
    return [];
  }

  const userIds = new Set<number>();
  for (const trade of pendingTrades) {
    userIds.add(trade.fromUserId);
    userIds.add(trade.toUserId);
  }

  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, Array.from(userIds)));

  const usersById = new Map(allUsers.map((u) => [u.id, u]));

  const tradeIds = pendingTrades.map((t) => t.id);
  const allTradePlayers = await db
    .select({
      tradePlayer: tradePlayers,
      player: {
        id: players.id,
        name: players.name,
        imageUrl: players.imageUrl,
        statsCharacter: players.statsCharacter,
      },
      fromTeam: {
        id: teams.id,
        name: teams.name,
      },
    })
    .from(tradePlayers)
    .innerJoin(players, eq(tradePlayers.playerId, players.id))
    .innerJoin(teams, eq(tradePlayers.fromTeamId, teams.id))
    .where(inArray(tradePlayers.tradeId, tradeIds));

  const toTeamIds = new Set(
    allTradePlayers.map((tp) => tp.tradePlayer.toTeamId)
  );
  const toTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, Array.from(toTeamIds)));
  const toTeamsById = new Map(toTeams.map((t) => [t.id, t]));

  const tradePlayersByTradeId = new Map<
    number,
    Array<{
      tradePlayer: TradePlayer;
      player: {
        id: number;
        name: string;
        imageUrl: string | null;
        statsCharacter: string | null;
      };
      fromTeam: { id: number; name: string };
      toTeam: { id: number; name: string };
    }>
  >();
  for (const tp of allTradePlayers) {
    if (!tradePlayersByTradeId.has(tp.tradePlayer.tradeId)) {
      tradePlayersByTradeId.set(tp.tradePlayer.tradeId, []);
    }
    const toTeam = toTeamsById.get(tp.tradePlayer.toTeamId);
    if (toTeam) {
      tradePlayersByTradeId.get(tp.tradePlayer.tradeId)!.push({
        tradePlayer: tp.tradePlayer,
        player: tp.player,
        fromTeam: tp.fromTeam,
        toTeam,
      });
    }
  }

  return pendingTrades.map((trade) => ({
    ...trade,
    fromUser: usersById.get(trade.fromUserId)!,
    toUser: usersById.get(trade.toUserId)!,
    tradePlayers: tradePlayersByTradeId.get(trade.id) || [],
  }));
};
