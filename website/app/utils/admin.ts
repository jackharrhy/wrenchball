import { eq, isNull } from "drizzle-orm";
import { LINEUP_SIZE, TEAM_SIZE } from "~/consts";
import { database } from "~/database/context";
import {
  players,
  seasonState,
  teamLineups,
  teams,
  type SeasonState as SeasonStateType,
  type SeasonStateValue,
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
): Promise<SeasonStateType | null> => {
  const state = await db
    .select()
    .from(seasonState)
    .where(eq(seasonState.id, 1))
    .limit(1);

  return state[0] || null;
};

export const setSeasonState = async (
  db: ReturnType<typeof database>,
  newState: SeasonStateValue
) => {
  const currentState = await getSeasonState(db);

  if (currentState) {
    await db
      .update(seasonState)
      .set({ state: newState })
      .where(eq(seasonState.id, 1));
  } else {
    await db.insert(seasonState).values({ id: 1, state: newState });
  }

  return { success: true, state: newState };
};
