import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { isNull, eq, sql, count } from "drizzle-orm";
import * as schema from "../database/schema";
import {
  getSeasonState,
  setSeasonState,
  getDraftingOrder,
  setCurrentDraftingUser,
} from "../app/utils/admin.server";
import { draftPlayer, setPlayerStarred } from "../app/utils/draft.server";
import {
  createMatch,
  updateMatchState,
  updateMatchScore,
  upsertMatchPlayerStats,
  getMatchById,
} from "../app/utils/matches.server";
import {
  createTradeRequest,
  acceptTrade,
  denyTrade,
} from "../app/utils/trading.server";
import { TEAM_SIZE, LINEUP_SIZE } from "../app/consts";
import {
  setDisable,
  getClient as getDiscordClient,
} from "../app/discord/client.server";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

// Helper functions
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomSample<T>(array: T[], n: number): T[] {
  const shuffled = shuffle(array);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// Main execution
async function main() {
  // Disable Discord posting for this script
  setDisable(true);
  console.log("=== Creating Random Fixture Data ===\n");

  // 1. Setup and Initialization
  console.log("1. Getting current season state...");
  const seasonState = await getSeasonState(db);
  if (!seasonState) {
    throw new Error("No season found. Please run insert-data.ts first.");
  }
  console.log(`   Season state: ${seasonState.state}`);

  console.log("2. Fetching users, teams, and players...");
  const allUsers = await db.select().from(schema.users);
  const allTeams = await db.select().from(schema.teams);
  const allPlayers = await db.select().from(schema.players);

  console.log(`   Found ${allUsers.length} users`);
  console.log(`   Found ${allTeams.length} teams`);
  console.log(`   Found ${allPlayers.length} players\n`);

  if (allUsers.length === 0) {
    throw new Error("No users found. Please run insert-data.ts first.");
  }

  const firstUserId = allUsers[0].id;

  // 2. Drafting Phase
  if (seasonState.state === "pre-season") {
    console.log("3. Transitioning from pre-season to drafting...");
    await setSeasonState(db, "drafting", firstUserId);
    console.log("   ✓ Season is now in drafting state\n");
  }

  const currentSeasonState = await getSeasonState(db);
  if (!currentSeasonState) {
    throw new Error("Failed to get season state");
  }

  if (currentSeasonState.state === "drafting") {
    console.log("4. Simulating draft picks...");
    const draftingOrder = await getDraftingOrder(db);
    console.log(
      `   Drafting order: ${draftingOrder.map((o) => o.userName).join(" -> ")}`,
    );

    let picksMade = 0;
    let starToggles = 0;

    while (true) {
      const currentState = await getSeasonState(db);
      if (!currentState || currentState.state !== "drafting") {
        break;
      }

      // Check if draft is complete
      const freeAgents = await db
        .select()
        .from(schema.players)
        .where(isNull(schema.players.teamId));

      if (freeAgents.length === 0) {
        console.log("   ✓ All players have been drafted");
        break;
      }

      // Check if all teams are full
      const teamCounts = await db
        .select({
          teamId: schema.players.teamId,
          count: count(),
        })
        .from(schema.players)
        .where(sql`${schema.players.teamId} IS NOT NULL`)
        .groupBy(schema.players.teamId);

      const allTeamsFull = teamCounts.every((tc) => tc.count >= TEAM_SIZE);
      if (allTeamsFull && teamCounts.length === allTeams.length) {
        console.log("   ✓ All teams are full");
        break;
      }

      // Get current drafting user
      if (!currentState.currentDraftingUserId) {
        throw new Error("No current drafting user set");
      }

      const currentUserId = currentState.currentDraftingUserId;
      const currentUser = allUsers.find((u) => u.id === currentUserId);
      if (!currentUser) {
        throw new Error(`User ${currentUserId} not found`);
      }

      // Get user's team
      const userTeam = allTeams.find((t) => t.userId === currentUserId);
      if (!userTeam) {
        throw new Error(`Team not found for user ${currentUserId}`);
      }

      // Check if user's team is full
      const userTeamPlayerCount = await db
        .select({ count: count() })
        .from(schema.players)
        .where(eq(schema.players.teamId, userTeam.id));

      if (userTeamPlayerCount[0].count >= TEAM_SIZE) {
        // Team is full, manually advance to next drafter
        console.log(`   Skipping ${currentUser.name} - team is full`);

        // Get drafting order and find next user
        const currentOrder = await getDraftingOrder(db);
        const currentIndex = currentOrder.findIndex(
          (o) => o.userId === currentUserId,
        );

        if (currentIndex === -1) {
          throw new Error(
            `Current user ${currentUserId} not found in drafting order`,
          );
        }

        // Calculate next index (simple round-robin for now, snake draft logic is complex)
        const nextIndex = (currentIndex + 1) % currentOrder.length;
        const nextUserId = currentOrder[nextIndex].userId;

        // Set next drafter
        await setCurrentDraftingUser(db, nextUserId);

        // Continue loop to try next user
        continue;
      }

      // Randomly select a free agent
      const selectedPlayer = randomChoice(freeAgents);
      console.log(
        `   Pick ${picksMade + 1}: ${currentUser.name} drafts ${selectedPlayer.name}`,
      );

      // Draft the player
      const draftResult = await draftPlayer(
        db,
        currentUserId,
        selectedPlayer.id,
        true,
      );
      if (!draftResult.success) {
        console.error(
          `   ✗ Failed to draft ${selectedPlayer.name}: ${draftResult.error}`,
        );
        break;
      }

      picksMade++;

      // Randomly toggle star status (30% chance)
      if (Math.random() < 0.3) {
        const userTeamPlayers = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.teamId, userTeam.id));

        if (userTeamPlayers.length > 0) {
          const playerToStar = randomChoice(userTeamPlayers);
          const starResult = await setPlayerStarred(
            db,
            currentUserId,
            playerToStar.id,
          );
          if (starResult.success) {
            starToggles++;
            console.log(
              `     ⭐ ${currentUser.name} toggled star for ${playerToStar.name}`,
            );
          }
        }
      }
    }

    console.log(
      `   ✓ Draft complete: ${picksMade} picks made, ${starToggles} star toggles\n`,
    );
  }

  // 3. Transition to Playing State
  const seasonStateBeforePlaying = await getSeasonState(db);
  if (seasonStateBeforePlaying?.state === "drafting") {
    console.log("5. Transitioning from drafting to playing...");
    await setSeasonState(db, "playing", firstUserId);
    console.log("   ✓ Season is now in playing state\n");
  }

  // 4. Interleaved Season Events (Matches + Trades)
  console.log("6. Creating interleaved season events (matches + trades)...");

  const numMatches = randomInt(10, 30);
  const numTrades = randomInt(10, 30);
  console.log(`   Will create ${numMatches} matches and ${numTrades} trades`);

  // Create event queue
  type EventType = { type: "match" } | { type: "trade" };
  const events: EventType[] = [
    ...Array(numMatches)
      .fill(null)
      .map(() => ({ type: "match" as const })),
    ...Array(numTrades)
      .fill(null)
      .map(() => ({ type: "trade" as const })),
  ];
  const shuffledEvents = shuffle(events);

  let matchesCreated = 0;
  let matchesFinished = 0;
  let tradesCreated = 0;
  let tradesAccepted = 0;
  let tradesRejected = 0;

  for (let i = 0; i < shuffledEvents.length; i++) {
    const event = shuffledEvents[i];

    if (event.type === "match") {
      try {
        // Get teams with enough players
        const teamsWithEnoughPlayers = [] as typeof allTeams;
        for (const team of allTeams) {
          const teamPlayerCount = await db
            .select({ count: count() })
            .from(schema.players)
            .where(eq(schema.players.teamId, team.id));

          if (teamPlayerCount[0].count >= LINEUP_SIZE) {
            teamsWithEnoughPlayers.push(team);
          }
        }

        if (teamsWithEnoughPlayers.length < 2) {
          console.log(
            `   ⚠ Skipping match ${i + 1}: Not enough teams with ${LINEUP_SIZE}+ players`,
          );
          continue;
        }

        // Randomly select two different teams
        const [teamA, teamB] = randomSample(teamsWithEnoughPlayers, 2);
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + randomInt(0, 30));

        const match = await createMatch(db, {
          teamAId: teamA.id,
          teamBId: teamB.id,
          scheduledDate,
        });

        matchesCreated++;
        console.log(
          `   Match ${matchesCreated}: ${teamA.name} vs ${teamB.name}`,
        );

        // Transition most matches (70%) through states
        if (Math.random() < 0.7) {
          const currentSeason = await getSeasonState(db);
          if (currentSeason) {
            // upcoming -> live
            await updateMatchState(db, match.id, "live", {
              userId: firstUserId,
              seasonId: currentSeason.id,
            });
            console.log(`     → Match ${matchesCreated} is now live`);

            // live -> finished
            await updateMatchState(db, match.id, "finished", {
              userId: firstUserId,
              seasonId: currentSeason.id,
            });
            const teamAScore = randomInt(0, 10);
            const teamBScore = randomInt(0, 10);
            await updateMatchScore(db, match.id, teamAScore, teamBScore);
            matchesFinished++;
            console.log(
              `     → Match ${matchesCreated} finished: ${teamAScore}-${teamBScore}`,
            );

            // Generate random player stats for finished match
            try {
              const matchWithData = await getMatchById(db, match.id);
              if (matchWithData && matchWithData.battingOrders.length > 0) {
                const stats = matchWithData.battingOrders.map((bo) => {
                  // Determine if player is a pitcher (P position)
                  const isPitcher = bo.fieldingPosition === "P";

                  // Batting stats (for all players)
                  const plateAppearances = randomInt(2, 5);
                  const hits = randomInt(0, Math.min(plateAppearances, 3));
                  const homeRuns =
                    hits > 0 && Math.random() < 0.3
                      ? randomInt(0, Math.min(hits, 2))
                      : 0;
                  const outs = plateAppearances - hits;
                  const rbi =
                    hits > 0 ? randomInt(0, Math.min(hits + 1, 4)) : 0;

                  // Pitching stats (only for pitcher)
                  const inningsPitchedWhole = isPitcher
                    ? randomInt(3, 7)
                    : null;
                  const inningsPitchedPartial = isPitcher
                    ? randomInt(0, 2)
                    : null;
                  const strikeouts = isPitcher ? randomInt(2, 8) : null;
                  const earnedRuns = isPitcher ? randomInt(0, 5) : null;

                  // Fielding stats (for all players)
                  const putouts = randomInt(0, 5);
                  const assists = randomInt(0, 3);
                  const doublePlays = Math.random() < 0.2 ? randomInt(0, 1) : 0;
                  const triplePlays = 0; // Very rare
                  const errors = Math.random() < 0.3 ? randomInt(0, 2) : 0;

                  return {
                    playerId: bo.playerId,
                    teamId: bo.teamId,
                    plateAppearances,
                    hits,
                    homeRuns,
                    outs,
                    rbi,
                    inningsPitchedWhole,
                    inningsPitchedPartial,
                    strikeouts,
                    earnedRuns,
                    putouts,
                    assists,
                    doublePlays,
                    triplePlays,
                    errors,
                  };
                });

                await upsertMatchPlayerStats(db, match.id, stats);
                console.log(
                  `     → Generated stats for ${stats.length} players in match ${matchesCreated}`,
                );
              }
            } catch (error) {
              console.error(
                `     ⚠ Failed to generate stats for match ${matchesCreated}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        } else {
          console.log(`     → Match ${matchesCreated} remains upcoming`);
        }
      } catch (error) {
        console.error(
          `   ✗ Failed to create match: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (event.type === "trade") {
      try {
        // Get users with teams that have enough players
        const usersWithValidTeams = [] as typeof allUsers;
        for (const user of allUsers) {
          const userTeam = allTeams.find((t) => t.userId === user.id);
          if (!userTeam) continue;

          const teamPlayerCount = await db
            .select({ count: count() })
            .from(schema.players)
            .where(eq(schema.players.teamId, userTeam.id));

          if (teamPlayerCount[0].count >= LINEUP_SIZE) {
            usersWithValidTeams.push(user);
          }
        }

        if (usersWithValidTeams.length < 2) {
          console.log(
            `   ⚠ Skipping trade ${i + 1}: Not enough users with valid teams`,
          );
          continue;
        }

        // Randomly select two different users
        const [fromUser, toUser] = randomSample(usersWithValidTeams, 2);

        // Get current players from each team
        const fromUserTeam = allTeams.find((t) => t.userId === fromUser.id)!;
        const toUserTeam = allTeams.find((t) => t.userId === toUser.id)!;

        const fromTeamPlayers = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.teamId, fromUserTeam.id));

        const toTeamPlayers = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.teamId, toUserTeam.id));

        if (fromTeamPlayers.length === 0 || toTeamPlayers.length === 0) {
          console.log(
            `   ⚠ Skipping trade ${i + 1}: One or both teams have no players`,
          );
          continue;
        }

        // Randomly select 1-3 players from each team
        const numFromPlayers = randomInt(
          1,
          Math.min(3, fromTeamPlayers.length),
        );
        const numToPlayers = randomInt(1, Math.min(3, toTeamPlayers.length));

        const fromPlayerIds = randomSample(fromTeamPlayers, numFromPlayers).map(
          (p) => p.id,
        );
        const toPlayerIds = randomSample(toTeamPlayers, numToPlayers).map(
          (p) => p.id,
        );

        // Create trade
        const tradeResult = await createTradeRequest(db, {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          fromPlayerIds,
          toPlayerIds,
        });

        if (!tradeResult.success) {
          console.log(`   ⚠ Skipping trade ${i + 1}: ${tradeResult.error}`);
          continue;
        }

        tradesCreated++;
        const fromPlayerNames = fromTeamPlayers
          .filter((p) => fromPlayerIds.includes(p.id))
          .map((p) => p.name)
          .join(", ");
        const toPlayerNames = toTeamPlayers
          .filter((p) => toPlayerIds.includes(p.id))
          .map((p) => p.name)
          .join(", ");
        console.log(
          `   Trade ${tradesCreated}: ${fromUser.name} offers [${fromPlayerNames}] for ${toUser.name}'s [${toPlayerNames}]`,
        );

        // Immediately process: Accept (60%) or Reject (40%)
        if (Math.random() < 0.6) {
          const acceptResult = await acceptTrade(
            db,
            tradeResult.tradeId!,
            toUser.id,
          );
          if (acceptResult.success) {
            tradesAccepted++;
            console.log(`     ✓ Trade ${tradesCreated} accepted`);
          } else {
            console.log(
              `     ✗ Failed to accept trade ${tradesCreated}: ${acceptResult.error}`,
            );
          }
        } else {
          const denyResult = await denyTrade(
            db,
            tradeResult.tradeId!,
            toUser.id,
          );
          if (denyResult.success) {
            tradesRejected++;
            console.log(`     ✗ Trade ${tradesCreated} rejected`);
          } else {
            console.log(
              `     ✗ Failed to reject trade ${tradesCreated}: ${denyResult.error}`,
            );
          }
        }
      } catch (error) {
        console.error(
          `   ✗ Failed to create trade: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Matches created: ${matchesCreated}`);
  console.log(`Matches finished: ${matchesFinished} (with player stats)`);
  console.log(`Trades created: ${tradesCreated}`);
  console.log(`Trades accepted: ${tradesAccepted}`);
  console.log(`Trades rejected: ${tradesRejected}`);

  await client.end();
  await getDiscordClient().destroy();
  console.log("\n✓ Script completed successfully!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
