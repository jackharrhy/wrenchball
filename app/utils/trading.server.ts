import { eq, and, or, sql, inArray } from "drizzle-orm";
import { TEAM_SIZE, LINEUP_SIZE } from "~/consts";
import { type Database } from "~/database/db";
import {
  trades,
  tradePlayers,
  players,
  teams,
  teamLineups,
  season,
} from "~/database/schema";
import { getSeasonState } from "./admin.server";
import { createTradeEvent } from "./events.server";

export interface CreateTradeRequestParams {
  fromUserId: number;
  toUserId: number;
  fromPlayerIds: number[];
  toPlayerIds: number[];
  proposalText?: string;
}

export const validateTradeRequest = async (
  db: Database,
  params: CreateTradeRequestParams,
  excludeTradeId?: number,
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

  // Get team captain information
  const [fromTeamData, toTeamData] = await Promise.all([
    db
      .select({ captainId: teams.captainId })
      .from(teams)
      .where(eq(teams.id, fromTeamId))
      .limit(1),
    db
      .select({ captainId: teams.captainId })
      .from(teams)
      .where(eq(teams.id, toTeamId))
      .limit(1),
  ]);

  const fromTeamCaptainId = fromTeamData[0]?.captainId;
  const toTeamCaptainId = toTeamData[0]?.captainId;

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

  // 4.5. Check if any players being traded are team captains
  if (fromTeamCaptainId !== null && fromTeamCaptainId !== undefined) {
    if (fromPlayerIds.includes(fromTeamCaptainId)) {
      return {
        valid: false,
        error: "Cannot trade your team captain",
      };
    }
  }

  if (toTeamCaptainId !== null && toTeamCaptainId !== undefined) {
    if (toPlayerIds.includes(toTeamCaptainId)) {
      return {
        valid: false,
        error: "Cannot trade the other team's captain",
      };
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
        eq(trades.toUserId, toUserId),
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
      pendingTradesWithPlayers.map((p) => p.playerId),
    );

    // Check if any of the players we're trying to trade are already in pending trades
    const conflictingPlayers = allPlayerIds.filter((playerId) =>
      playersInPendingTrades.has(playerId),
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
  // fromTeam loses fromPlayerIds, gains toPlayerIds
  const fromTeamSizeAfterTrade =
    fromTeamPlayers.length - fromPlayerIds.length + toPlayerIds.length;
  // toTeam loses toPlayerIds, gains fromPlayerIds
  const toTeamSizeAfterTrade =
    toTeamPlayers.length - toPlayerIds.length + fromPlayerIds.length;

  if (fromTeamSizeAfterTrade > TEAM_SIZE) {
    return {
      valid: false,
      error: `Trade would exceed maximum team size of ${TEAM_SIZE}`,
    };
  }

  if (toTeamSizeAfterTrade > TEAM_SIZE) {
    return {
      valid: false,
      error: `Trade would exceed other team's maximum size of ${TEAM_SIZE}`,
    };
  }

  if (fromTeamSizeAfterTrade < LINEUP_SIZE) {
    return {
      valid: false,
      error: `Trade would leave your team with less than ${LINEUP_SIZE} players (minimum required for lineup)`,
    };
  }

  if (toTeamSizeAfterTrade < LINEUP_SIZE) {
    return {
      valid: false,
      error: `Trade would leave other team with less than ${LINEUP_SIZE} players (minimum required for lineup)`,
    };
  }

  return { valid: true };
};

export const createTradeRequest = async (
  db: Database,
  params: CreateTradeRequestParams,
): Promise<{ success: boolean; error?: string; tradeId?: number }> => {
  const validation = await validateTradeRequest(db, params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { fromUserId, toUserId, fromPlayerIds, toPlayerIds, proposalText } =
    params;

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
        proposalText: proposalText || null,
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
        })),
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
        })),
      );
    }
  });

  if (!tradeId) {
    return { success: false, error: "Failed to create trade" };
  }

  // Create trade proposal event
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { success: false, error: "No active season found" };
  }

  const eventResult = await createTradeEvent(
    db,
    fromUserId,
    tradeId,
    seasonState.id,
    "proposed",
  );
  if (!eventResult.success) {
    console.error("Failed to create trade proposal event:", eventResult.error);
    // Don't fail the trade creation if event creation fails
  }

  return { success: true, tradeId };
};

export const acceptTrade = async (
  db: Database,
  tradeId: number,
  userId: number,
  responseText?: string,
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
    tradeId,
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
      .set({
        status: "accepted",
        responseText: responseText || null,
        updatedAt: new Date(),
      })
      .where(eq(trades.id, tradeId));

    // Create trade acceptance event
    const seasonState = await getSeasonState(tx);
    if (!seasonState) {
      throw new Error("No active season found");
    }

    const eventResult = await createTradeEvent(
      tx,
      userId,
      tradeId,
      seasonState.id,
      "accepted",
    );
    if (!eventResult.success) {
      console.error(
        "Failed to create trade acceptance event:",
        eventResult.error,
      );
      // Don't fail the trade acceptance if event creation fails
    }
  });

  return { success: true };
};

export const denyTrade = async (
  db: Database,
  tradeId: number,
  userId: number,
  responseText?: string,
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

  if (tradeData.fromUserId !== userId && tradeData.toUserId !== userId) {
    return {
      success: false,
      error: "You are not authorized to deny this trade",
    };
  }

  // Determine if it's a cancellation (by initiator) or rejection (by recipient)
  const isCancellation = tradeData.fromUserId === userId;
  const action = isCancellation ? "cancelled" : "rejected";
  const status = isCancellation ? "cancelled" : "denied";

  await db
    .update(trades)
    .set({ status, responseText: responseText || null, updatedAt: new Date() })
    .where(eq(trades.id, tradeId));

  // Create trade rejection/cancellation event
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    return { success: false, error: "No active season found" };
  }

  const eventResult = await createTradeEvent(
    db,
    userId,
    tradeId,
    seasonState.id,
    action,
  );
  if (!eventResult.success) {
    console.error(
      "Failed to create trade rejection/cancellation event:",
      eventResult.error,
    );
    // Don't fail the trade denial if event creation fails
  }

  return { success: true };
};

export const getPendingTradesForUser = async (db: Database, userId: number) => {
  const pendingTrades = await db.query.trades.findMany({
    where: (trades, { and, eq }) =>
      and(
        or(eq(trades.toUserId, userId), eq(trades.fromUserId, userId)),
        eq(trades.status, "pending"),
      ),
    orderBy: (trades, { desc }) => desc(trades.createdAt),
    with: {
      fromUser: true,
      toUser: true,
      fromTeam: true,
      toTeam: true,
      tradePlayers: {
        with: {
          player: {
            with: {
              lineup: true,
            },
          },
        },
      },
    },
  });

  return pendingTrades;
};

export const getTrades = async (
  db: Database,
  {
    page = 1,
    pageSize = 20,
    userId,
    order = "desc" as "asc" | "desc",
  }: {
    page?: number;
    pageSize?: number;
    userId?: number;
    order?: "asc" | "desc";
  } = {},
) => {
  const offset = (page - 1) * pageSize;

  let whereClause;
  if (userId !== undefined) {
    whereClause = or(
      eq(trades.fromUserId, userId),
      eq(trades.toUserId, userId),
    );
  }

  const tradesQuery = db.query.trades.findMany({
    where: whereClause,
    orderBy:
      order === "asc"
        ? (trades, { asc }) => asc(trades.createdAt)
        : (trades, { desc }) => desc(trades.createdAt),
    limit: pageSize,
    offset: offset,
    with: {
      fromUser: true,
      toUser: true,
      fromTeam: true,
      toTeam: true,
      tradePlayers: {
        with: {
          player: {
            with: {
              lineup: true,
            },
          },
        },
      },
    },
  });

  const totalQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(trades)
    .where(whereClause);

  const [tradesResult, totalResult] = await Promise.all([
    tradesQuery,
    totalQuery,
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    trades: tradesResult,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
};

export const getTradeById = async (db: Database, tradeId: number) => {
  const trade = await db.query.trades.findFirst({
    where: eq(trades.id, tradeId),
    with: {
      fromUser: true,
      toUser: true,
      fromTeam: true,
      toTeam: true,
      tradePlayers: {
        with: {
          player: {
            with: {
              lineup: true,
            },
          },
        },
      },
    },
  });

  return trade;
};
