import { eq, isNull, and, asc } from "drizzle-orm";
import { LINEUP_SIZE, TEAM_SIZE } from "~/consts";
import { database } from "~/database/context";
import {
  players,
  season,
  stats,
  teamLineups,
  teams,
  users,
  usersSeasons,
  type Season as SeasonType,
  type SeasonState,
} from "~/database/schema";
import { readXLSXFromData, parseCSV } from "~/utils/fileParsing";
import { existsSync } from "fs";
import { join } from "path";

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

export const setCurrentDraftingUser = async (
  db: ReturnType<typeof database>,
  userId: number
) => {
  const currentSeason = await getSeasonState(db);
  if (!currentSeason) {
    throw new Error("No current season found");
  }

  if (currentSeason.state !== "drafting") {
    throw new Error("Season is not in drafting state");
  }

  await db
    .update(season)
    .set({ currentDraftingUserId: userId })
    .where(eq(season.id, 1));
};

export const importUsersFromCSV = async (
  db: ReturnType<typeof database>,
  csvData: Array<Record<string, string>>
) => {
  const results = {
    success: 0,
    skipped: 0,
    errors: [] as Array<{ row: number; error: string }>,
  };

  await db.transaction(async (tx) => {
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const name = row.name?.trim();
      const initial = row.initial?.trim();
      const discordSnowflake = row.discord_snowflake?.trim();
      const role = row.role?.trim() as "admin" | "user";

      if (!name || !discordSnowflake || !role) {
        results.errors.push({
          row: i + 2, // +2 for header and 0-index
          error: "Missing required fields: name, discord_snowflake, or role",
        });
        continue;
      }

      if (role !== "admin" && role !== "user") {
        results.errors.push({
          row: i + 2,
          error: `Invalid role: ${role}. Must be "admin" or "user"`,
        });
        continue;
      }

      try {
        // Check if user already exists
        const existingUser = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.discordSnowflake, discordSnowflake))
          .limit(1);

        if (existingUser.length > 0) {
          results.skipped++;
          continue;
        }

        // Create user
        const [user] = await tx
          .insert(users)
          .values({
            name,
            role,
            discordSnowflake,
          })
          .returning({ id: users.id, name: users.name });

        // Create team
        const teamName = `${user.name}'s Team`;
        const abbreviation = initial || user.name.slice(0, 3).toUpperCase();

        await tx.insert(teams).values({
          name: teamName,
          userId: user.id,
          abbreviation,
          color: "white",
        });

        results.success++;
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }
  });

  // Add all new users to draft entries after transaction completes
  await createDraftEntriesForAllUsers(db);

  return results;
};

export const loadPlayerData = async (
  db: ReturnType<typeof database>,
  miiMetadataCSV?: string
) => {
  const results = {
    statsInserted: 0,
    playersInserted: 0,
    errors: [] as Array<string>,
  };

  try {
    // TODO extract player names from excel and just
    // include inline, so we don't have to pull in
    // THE ENTIRE SEASON 3 XLSX FILE
    // for some bloddy player names

    // Read character list from Excel
    const characterListData = await readXLSXFromData(
      "lil sLUg crew S3.xlsx",
      "Character List"
    );
    const playerNames = characterListData
      .map((row: any) => row.Character)
      .filter((name: any) => name && name !== "Empty")
      .filter(
        (name: any, index: number, self: any[]) => self.indexOf(name) === index
      ); // unique

    // Read stats table from Excel
    const statTableData = await readXLSXFromData(
      "Sluggers Stat Table.xlsx",
      "Relevant Stats",
      2 // header row is at index 2 (3rd row)
    );

    // Filter out "Unused" rows and process
    const filteredStats = statTableData.filter(
      (row: any) => !String(row.Character || "").startsWith("Unused")
    );

    // Clean up character names
    const cleanupCharacterName = (name: string): string => {
      let cleanedName = String(name);
      if (cleanedName.includes("Koopa Troopa")) {
        cleanedName = cleanedName.replace("Koopa Troopa", "Koopa");
      }
      if (cleanedName.includes("Koopa Paratroopa")) {
        cleanedName = cleanedName.replace("Koopa Paratroopa", "Paratroopa");
      }
      if (cleanedName.endsWith(".") && !cleanedName.endsWith("Jr.")) {
        cleanedName = cleanedName.slice(0, -1);
      }
      const match = cleanedName.match(/^(.*) \(([^)]+)\)$/);
      if (match) {
        const [, base, thing] = match;
        if (base === "Dark Bones") {
          cleanedName = base;
        } else if (thing !== "F") {
          cleanedName = `${thing} ${base}`;
        }
      }
      return cleanedName;
    };

    // Column mapping
    const columnMapping: Record<string, string> = {
      Character: "character",
      "Character Class": "character_class",
      Captain: "captain",
      "Throwing Arm": "throwing_arm",
      "Batting Stance": "batting_stance",
      Ability: "ability",
      Weight: "weight",
      "Hitting\nTrajectory\n(sweet spot)": "hitting_trajectory",
      "Slap hit\ncontact size": "slap_hit_contact_size",
      "Charge Hit \nContact Size": "charge_hit_contact_size",
      "Slap Hit \nPower?": "slap_hit_power",
      "Charge Hit \nPower": "charge_hit_power",
      Bunting: "bunting",
      Speed: "speed",
      "Throwing\nSpeed": "throwing_speed",
      Fielding: "fielding",
      "Curveball \nSpeed": "curveball_speed",
      "Fastball\nSpeed": "fastball_speed",
      Curve: "curve",
      Stamina: "stamina",
      "Pitching CSS": "pitching_css",
      "Batting CSS": "batting_css",
      "Fielding CSS": "fielding_css",
      "Speed CSS": "speed_css",
    };

    // Process and insert stats
    await db.transaction(async (tx) => {
      for (const row of filteredStats) {
        const cleanedCharacter = cleanupCharacterName(
          String(row.Character || "")
        );
        const mappedRow: Record<string, any> = {};

        for (const [excelCol, dbCol] of Object.entries(columnMapping)) {
          let value = row[excelCol];
          if (dbCol === "character") {
            value = cleanedCharacter;
          } else if (dbCol === "captain") {
            value = String(value).trim().toLowerCase() === "yes";
          } else if (dbCol === "stamina") {
            value = parseInt(String(value).replace(/,/g, ""), 10);
          } else if (
            [
              "weight",
              "slap_hit_contact_size",
              "charge_hit_contact_size",
              "slap_hit_power",
              "charge_hit_power",
              "bunting",
              "speed",
              "throwing_speed",
              "fielding",
              "curveball_speed",
              "fastball_speed",
              "curve",
              "pitching_css",
              "batting_css",
              "fielding_css",
              "speed_css",
            ].includes(dbCol)
          ) {
            value = parseInt(String(value), 10);
          }
          mappedRow[dbCol] = value;
        }

        try {
          await tx.insert(stats).values({
            character: mappedRow.character,
            characterClass: mappedRow.character_class,
            captain: mappedRow.captain,
            throwingArm: mappedRow.throwing_arm,
            battingStance: mappedRow.batting_stance,
            ability: mappedRow.ability,
            weight: mappedRow.weight,
            hittingTrajectory: mappedRow.hitting_trajectory,
            slapHitContactSize: mappedRow.slap_hit_contact_size,
            chargeHitContactSize: mappedRow.charge_hit_contact_size,
            slapHitPower: mappedRow.slap_hit_power,
            chargeHitPower: mappedRow.charge_hit_power,
            bunting: mappedRow.bunting,
            speed: mappedRow.speed,
            throwingSpeed: mappedRow.throwing_speed,
            fielding: mappedRow.fielding,
            curveballSpeed: mappedRow.curveball_speed,
            fastballSpeed: mappedRow.fastball_speed,
            curve: mappedRow.curve,
            stamina: mappedRow.stamina,
            pitchingCss: mappedRow.pitching_css,
            battingCss: mappedRow.batting_css,
            fieldingCss: mappedRow.fielding_css,
            speedCss: mappedRow.speed_css,
          });
          results.statsInserted++;
        } catch (error) {
          results.errors.push(
            `Failed to insert stat for ${mappedRow.character}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      // Parse MII metadata if provided
      let miiMetadata: Array<Record<string, string>> = [];
      if (miiMetadataCSV) {
        miiMetadata = await parseCSV(miiMetadataCSV);
      }

      // Get all stat characters for matching
      const allStatCharacters = filteredStats.map((row: any) =>
        cleanupCharacterName(String(row.Character || ""))
      );

      // Process and insert players
      for (const playerName of playerNames) {
        let statsCharacter: string | null = null;

        // Check if player name matches a stat character directly
        if (allStatCharacters.includes(playerName)) {
          statsCharacter = playerName;
        } else {
          // Try to match via MII metadata if provided
          if (miiMetadata.length > 0) {
            let miiName = playerName;
            if (miiName === "Crelulu") {
              miiName = "crululu";
            }
            if (miiName === "The Grabber") {
              miiName = "grabber";
            }

            const miiRow = miiMetadata.find(
              (m) =>
                m.mii_name === miiName || m.mii_name === miiName.toLowerCase()
            );

            if (miiRow) {
              let favoriteColor = miiRow.favorite_color;
              if (favoriteColor === "DarkGreen") {
                favoriteColor = "Green";
              }
              // Add space before capital letters
              favoriteColor = favoriteColor.replace(/([a-z])([A-Z])/g, "$1 $2");
              const gender = miiRow.gender;
              const statsCharacterCandidate =
                gender === "Female"
                  ? `${favoriteColor} Mii (F)`
                  : `${favoriteColor} Mii`;

              if (allStatCharacters.includes(statsCharacterCandidate)) {
                statsCharacter = statsCharacterCandidate;
              } else {
                results.errors.push(
                  `No stats character found for ${playerName}, ${miiName}, ${favoriteColor}, ${gender}`
                );
                continue;
              }
            } else {
              results.errors.push(`No mii metadata found for ${playerName}`);
              continue;
            }
          } else {
            results.errors.push(
              `No stats character found for ${playerName} and no MII metadata provided`
            );
            continue;
          }
        }

        // Determine image URL
        const nameMap: Record<string, string> = {
          "Shy Guy": "Red Shy Guy",
          Koopa: "Green Koopa",
          Paratroopa: "Red Paratroopa",
          Magikoopa: "Red Magikoopa",
          "Dark Bones": "Gray Dry Bones",
        };

        let imageName = playerName;
        if (playerName in nameMap) {
          imageName = nameMap[playerName];
        }

        const imageFilename = `${imageName.toLowerCase().replace(/\./g, "")}.png`;
        const sideviewPath = join(
          process.cwd(),
          "public",
          "images",
          "players",
          "sideview",
          "right",
          imageFilename
        );
        const miiPath = join(
          process.cwd(),
          "public",
          "images",
          "miis",
          `${playerName.toLowerCase()}.png`
        );

        let imageUrl: string | null = null;
        if (existsSync(sideviewPath)) {
          imageUrl = `/images/players/sideview/right/${imageFilename}`;
        } else if (existsSync(miiPath)) {
          imageUrl = `/images/miis/${playerName.toLowerCase()}.png`;
        }

        try {
          await tx.insert(players).values({
            name: playerName,
            teamId: null,
            imageUrl,
            statsCharacter,
          });
          results.playersInserted++;
        } catch (error) {
          results.errors.push(
            `Failed to insert player ${playerName}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    });
  } catch (error) {
    results.errors.push(
      `Failed to load player data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  return results;
};
