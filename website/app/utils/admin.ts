import { eq, isNull, and, asc } from "drizzle-orm";
import { LINEUP_SIZE, TEAM_SIZE } from "~/consts";
import { database } from "~/database/context";
import {
  players,
  season,
  teamLineups,
  teams,
  users,
  usersSeasons,
  type Season as SeasonType,
  type SeasonState,
} from "~/database/schema";

export const wipeTeams = async (db: ReturnType<typeof database>) => {
  await db.transaction(async (tx) => {
    await tx.delete(teamLineups);
    await tx.update(players).set({ teamId: null });
  });
};

export const randomAssignTeams = async (db: ReturnType<typeof database>) => {
  await db.transaction(async (tx) => {
    const allTeams = await tx.select({ id: teams.id }).from(teams);
    const unassignedPlayers = await tx
      .select({ id: players.id })
      .from(players)
      .where(isNull(players.teamId));

    if (unassignedPlayers.length === 0) {
      return { success: false, message: "No unassigned players found" };
    }

    const shuffledPlayers = [...unassignedPlayers].sort(
      () => Math.random() - 0.5
    );

    let teamIndex = 0;
    const teamSizes = new Map();
    for (const team of allTeams) {
      const currentPlayers = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, team.id));
      teamSizes.set(team.id, currentPlayers.length);
    }

    for (const player of shuffledPlayers) {
      let assigned = false;
      let attempts = 0;

      while (!assigned && attempts < allTeams.length) {
        const currentTeam = allTeams[teamIndex];
        const currentSize = teamSizes.get(currentTeam.id) || 0;

        if (currentSize < TEAM_SIZE) {
          await tx
            .update(players)
            .set({ teamId: currentTeam.id })
            .where(eq(players.id, player.id));

          teamSizes.set(currentTeam.id, currentSize + 1);
          assigned = true;
        }

        teamIndex = (teamIndex + 1) % allTeams.length;
        attempts++;
      }

      if (!assigned) {
        break;
      }
    }

    for (const team of allTeams) {
      const teamPlayers = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, team.id));

      if (teamPlayers.length === 0) continue;

      if (teamPlayers.length > 0) {
        for (const teamPlayer of teamPlayers) {
          await tx
            .delete(teamLineups)
            .where(eq(teamLineups.playerId, teamPlayer.id));
        }
      }

      const shuffledTeamPlayers = [...teamPlayers].sort(
        () => Math.random() - 0.5
      );

      const positions = [
        "C",
        "1B",
        "2B",
        "3B",
        "SS",
        "LF",
        "CF",
        "RF",
        "P",
      ] as const;

      const lineupSize = Math.min(shuffledTeamPlayers.length, LINEUP_SIZE);

      for (let i = 0; i < lineupSize; i++) {
        const player = shuffledTeamPlayers[i];
        const position = positions[i];
        const battingOrder = i + 1;

        await tx.insert(teamLineups).values({
          playerId: player.id,
          fieldingPosition: position,
          battingOrder: battingOrder,
          isStarred: false,
        });
      }
    }
  });
};

export const getSeasonState = async (
  db: ReturnType<typeof database>
): Promise<SeasonType | null> => {
  const state = await db.select().from(season).where(eq(season.id, 1)).limit(1);

  return state[0] || null;
};

export const setSeasonState = async (
  db: ReturnType<typeof database>,
  newState: SeasonState
) => {
  const currentState = await getSeasonState(db);

  await db.transaction(async (tx) => {
    if (currentState?.state === "pre-season" && newState === "drafting") {
      await tx.delete(teamLineups);
      await tx.update(players).set({ teamId: null });

      const draftingOrder = await tx
        .select({
          userId: usersSeasons.userId,
        })
        .from(usersSeasons)
        .where(eq(usersSeasons.seasonId, currentState.id))
        .orderBy(asc(usersSeasons.draftingTurn))
        .limit(1);

      const currentDraftingUserId =
        draftingOrder.length > 0 ? draftingOrder[0].userId : null;

      if (currentState) {
        await tx
          .update(season)
          .set({ state: newState, currentDraftingUserId })
          .where(eq(season.id, 1));
      } else {
        await tx
          .insert(season)
          .values({ id: 1, state: newState, currentDraftingUserId });
      }
    } else if (currentState?.state === "drafting" && newState === "playing") {
      await tx
        .update(season)
        .set({ state: newState, currentDraftingUserId: null })
        .where(eq(season.id, 1));
    } else {
      if (currentState) {
        await tx
          .update(season)
          .set({ state: newState })
          .where(eq(season.id, 1));
      } else {
        await tx.insert(season).values({ id: 1, state: newState });
      }
    }
  });

  return { success: true, state: newState };
};

export const getDraftingOrder = async (
  db: ReturnType<typeof database>
): Promise<
  Array<{
    userId: number;
    userName: string;
    draftingTurn: number;
  }>
> => {
  const currentSeason = await getSeasonState(db);
  if (!currentSeason) {
    return [];
  }

  const order = await db
    .select({
      userId: usersSeasons.userId,
      userName: users.name,
      draftingTurn: usersSeasons.draftingTurn,
    })
    .from(usersSeasons)
    .innerJoin(users, eq(usersSeasons.userId, users.id))
    .where(eq(usersSeasons.seasonId, currentSeason.id))
    .orderBy(asc(usersSeasons.draftingTurn));

  return order;
};

export const adjustDraftingOrder = async (
  db: ReturnType<typeof database>,
  userId: number,
  direction: "up" | "down"
) => {
  const currentSeason = await getSeasonState(db);
  if (!currentSeason) {
    throw new Error("No current season found");
  }

  await db.transaction(async (tx) => {
    const currentUserTurn = await tx
      .select({ draftingTurn: usersSeasons.draftingTurn })
      .from(usersSeasons)
      .where(
        and(
          eq(usersSeasons.userId, userId),
          eq(usersSeasons.seasonId, currentSeason.id)
        )
      )
      .limit(1);

    if (currentUserTurn.length === 0) {
      throw new Error("User not found in current season");
    }

    const currentTurn = currentUserTurn[0].draftingTurn;
    const newTurn = direction === "up" ? currentTurn - 1 : currentTurn + 1;

    const targetUser = await tx
      .select({ userId: usersSeasons.userId })
      .from(usersSeasons)
      .where(
        and(
          eq(usersSeasons.seasonId, currentSeason.id),
          eq(usersSeasons.draftingTurn, newTurn)
        )
      )
      .limit(1);

    if (targetUser.length === 0) {
      throw new Error("No user at target position");
    }

    const targetUserId = targetUser[0].userId;

    await tx
      .update(usersSeasons)
      .set({ draftingTurn: newTurn })
      .where(
        and(
          eq(usersSeasons.userId, userId),
          eq(usersSeasons.seasonId, currentSeason.id)
        )
      );

    await tx
      .update(usersSeasons)
      .set({ draftingTurn: currentTurn })
      .where(
        and(
          eq(usersSeasons.userId, targetUserId),
          eq(usersSeasons.seasonId, currentSeason.id)
        )
      );

    const allUsers = await tx
      .select({
        userId: usersSeasons.userId,
        draftingTurn: usersSeasons.draftingTurn,
      })
      .from(usersSeasons)
      .where(eq(usersSeasons.seasonId, currentSeason.id))
      .orderBy(asc(usersSeasons.draftingTurn));

    for (let i = 0; i < allUsers.length; i++) {
      await tx
        .update(usersSeasons)
        .set({ draftingTurn: i + 1 })
        .where(
          and(
            eq(usersSeasons.userId, allUsers[i].userId),
            eq(usersSeasons.seasonId, currentSeason.id)
          )
        );
    }
  });
};

export const randomAssignDraftOrder = async (
  db: ReturnType<typeof database>
) => {
  const currentSeason = await getSeasonState(db);
  if (!currentSeason) {
    throw new Error("No current season found");
  }

  await db.transaction(async (tx) => {
    const allUsers = await tx
      .select({
        userId: usersSeasons.userId,
      })
      .from(usersSeasons)
      .where(eq(usersSeasons.seasonId, currentSeason.id));

    if (allUsers.length === 0) {
      return;
    }

    const shuffledUsers = [...allUsers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffledUsers.length; i++) {
      await tx
        .update(usersSeasons)
        .set({ draftingTurn: i + 1 })
        .where(
          and(
            eq(usersSeasons.userId, shuffledUsers[i].userId),
            eq(usersSeasons.seasonId, currentSeason.id)
          )
        );
    }
  });
};

export const createDraftEntriesForAllUsers = async (
  db: ReturnType<typeof database>
) => {
  const currentSeason = await getSeasonState(db);
  if (!currentSeason) {
    throw new Error("No current season found");
  }

  await db.transaction(async (tx) => {
    const allUsers = await tx.select({ id: users.id }).from(users);

    const existingEntries = await tx
      .select({
        userId: usersSeasons.userId,
        draftingTurn: usersSeasons.draftingTurn,
      })
      .from(usersSeasons)
      .where(eq(usersSeasons.seasonId, currentSeason.id))
      .orderBy(asc(usersSeasons.draftingTurn));

    const existingUserIds = new Set(existingEntries.map((e) => e.userId));

    const newUsers = allUsers.filter((u) => !existingUserIds.has(u.id));

    if (newUsers.length === 0) {
      return;
    }

    const maxTurn =
      existingEntries.length > 0
        ? existingEntries[existingEntries.length - 1].draftingTurn
        : 0;

    const startTurn = maxTurn + 1;

    for (let i = 0; i < newUsers.length; i++) {
      await tx.insert(usersSeasons).values({
        userId: newUsers[i].id,
        seasonId: currentSeason.id,
        draftingTurn: startTurn + i,
      });
    }
  });
};

export const deleteUser = async (
  db: ReturnType<typeof database>,
  userId: number
) => {
  await db.transaction(async (tx) => {
    const userTeam = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.userId, userId))
      .limit(1);

    if (userTeam.length > 0) {
      const teamId = userTeam[0].id;
      const teamPlayers = await tx
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, teamId));

      for (const player of teamPlayers) {
        await tx.delete(teamLineups).where(eq(teamLineups.playerId, player.id));
      }
    }

    await tx.delete(users).where(eq(users.id, userId));
  });
};

export const createUser = async (
  db: ReturnType<typeof database>,
  name: string,
  role: "admin" | "user",
  discordSnowflake: string
) => {
  const [user] = await db
    .insert(users)
    .values({
      name,
      role,
      discordSnowflake,
    })
    .returning({ id: users.id, name: users.name });

  const teamName = `${user.name}'s Team`;
  const abbreviation =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3) || user.name.slice(0, 3).toUpperCase();

  await db.insert(teams).values({
    name: teamName,
    userId: user.id,
    abbreviation,
    color: "white",
  });
  await createDraftEntriesForAllUsers(db);
};
