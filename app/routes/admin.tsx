import { redirect, Form, Link } from "react-router";
import type { Route } from "./+types/admin";
import { requireUser, impersonateUser } from "~/auth.server";
import { db } from "~/database/db";
import {
  seasonState,
  matchState,
  matches,
  type SeasonState,
  type MatchState,
} from "~/database/schema";
import { asc, desc } from "drizzle-orm";
import {
  randomAssignTeams,
  wipeTeams,
  wipeTrades,
  getSeasonState,
  setSeasonState,
  getDraftingOrder,
  adjustDraftingOrder,
  randomAssignDraftOrder,
  createDraftEntriesForAllUsers,
  deleteUser,
  createUser,
  setCurrentDraftingUser,
} from "~/utils/admin.server";
import {
  createMatch,
  updateMatchState,
  updateMatchScore,
  deleteMatch,
  getTeamsForMatchCreation,
} from "~/utils/matches.server";
import { formatTeamName } from "~/utils/formatTeamName";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const currentState = await getSeasonState(db);
  const draftingOrder = await getDraftingOrder(db);
  const allMatches = await db.query.matches.findMany({
    with: {
      teamA: true,
      teamB: true,
    },
    orderBy: [asc(matches.scheduledDate), desc(matches.createdAt)],
  });
  const teams = await getTeamsForMatchCreation(db);

  return {
    user,
    seasonState: currentState,
    draftingOrder,
    matches: allMatches,
    teams,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "set-season-state") {
    const state = formData.get("state") as string;
    const confirmed = confirm(
      `Are you sure you want to change the season state to "${state}"?`,
    );
    if (!confirmed) {
      return { success: false, message: "State change cancelled" };
    }
  }

  if (intent === "wipe-teams") {
    const confirmed = confirm(
      "Are you sure you want to remove all players from teams? This cannot be undone.",
    );
    if (!confirmed) {
      return { success: false, message: "Team wipe cancelled" };
    }
  }

  if (intent === "wipe-trades") {
    const confirmed = confirm(
      "Are you sure you want to delete all trades? This cannot be undone.",
    );
    if (!confirmed) {
      return { success: false, message: "Trade wipe cancelled" };
    }
  }

  if (intent === "create-draft-entries") {
    const confirmed = confirm(
      "Are you sure you want to add all users to the current season's draft order?",
    );
    if (!confirmed) {
      return { success: false, message: "Draft entry creation cancelled" };
    }
  }

  if (intent === "random-assign-players") {
    const confirmed = confirm(
      "Are you sure you want to randomly assign players to teams?",
    );
    if (!confirmed) {
      return { success: false, message: "Player assignment cancelled" };
    }
  }

  if (intent === "random-assign-draft-order") {
    const confirmed = confirm(
      "Are you sure you want to randomly assign the draft order?",
    );
    if (!confirmed) {
      return { success: false, message: "Draft order randomization cancelled" };
    }
  }

  if (intent === "delete-user") {
    const userId = formData.get("userId");
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to delete user "${userName}"? This will also delete their team, remove players from their team, and cannot be undone.`,
    );
    if (!confirmed) {
      return { success: false, message: "User deletion cancelled" };
    }
  }

  if (intent === "create-user") {
    const name = formData.get("name");
    const role = formData.get("role");
    const discordSnowflake = formData.get("discordSnowflake");

    if (!name || !role || !discordSnowflake) {
      return { success: false, message: "All fields are required" };
    }
  }

  if (intent === "set-current-drafting-user") {
    const userId = formData.get("userId");
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to set "${userName}" as the current drafting user?`,
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "impersonate-user") {
    const userId = formData.get("userId");
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to impersonate "${userName}"? You will be logged in as this user.`,
    );
    if (!confirmed) {
      return { success: false, message: "Impersonation cancelled" };
    }
  }

  if (intent === "create-match") {
    const teamAId = formData.get("teamAId");
    const teamBId = formData.get("teamBId");

    if (!teamAId || !teamBId) {
      return { success: false, message: "Both teams are required" };
    }

    if (teamAId === teamBId) {
      return { success: false, message: "Team A and Team B must be different" };
    }
  }

  if (intent === "delete-match") {
    const confirmed = confirm(
      "Are you sure you want to delete this match? This cannot be undone.",
    );
    if (!confirmed) {
      return { success: false, message: "Match deletion cancelled" };
    }
  }

  if (intent === "update-match-state") {
    const newState = formData.get("state") as string;
    const confirmed = confirm(
      `Are you sure you want to change the match state to "${newState}"?`,
    );
    if (!confirmed) {
      return { success: false, message: "State change cancelled" };
    }
  }

  return await serverAction();
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "wipe-teams") {
    try {
      await wipeTeams(db);
      return {
        success: true,
        message: "All players removed from teams and lineups cleared",
      };
    } catch (error) {
      console.error("Error during team wipe:", error);
      return { success: false, message: "Failed to clear teams and lineups" };
    }
  }

  if (intent === "wipe-trades") {
    try {
      await wipeTrades(db);
      return {
        success: true,
        message: "All trades deleted successfully",
      };
    } catch (error) {
      console.error("Error during trade wipe:", error);
      return { success: false, message: "Failed to delete trades" };
    }
  }

  if (intent === "random-assign-players") {
    try {
      await randomAssignTeams(db);
      return {
        success: true,
        message: "Players randomly assigned to teams with lineups generated",
      };
    } catch (error) {
      console.error("Error during random assignment:", error);
      return { success: false, message: "Failed to assign players to teams" };
    }
  }

  if (intent === "random-assign-draft-order") {
    try {
      await randomAssignDraftOrder(db);
      return {
        success: true,
        message: "Draft order randomly assigned",
      };
    } catch (error) {
      console.error("Error during draft order randomization:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to randomize draft order",
      };
    }
  }

  if (intent === "create-draft-entries") {
    try {
      await createDraftEntriesForAllUsers(db);
      return {
        success: true,
        message: "Draft entries created for all users",
      };
    } catch (error) {
      console.error("Error creating draft entries:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create draft entries",
      };
    }
  }

  if (intent === "set-season-state") {
    const state = formData.get("state") as SeasonState;

    if (
      !state ||
      !(seasonState.enumValues as readonly string[]).includes(state)
    ) {
      return { success: false, message: "Invalid season state" };
    }

    try {
      await setSeasonState(db, state, user.id);
      return {
        success: true,
        message: `Season state updated to: ${state}`,
      };
    } catch (error) {
      console.error("Error setting season state:", error);
      return { success: false, message: "Failed to update season state" };
    }
  }

  if (intent === "adjust-draft-order") {
    const userIdStr = formData.get("userId");
    const direction = formData.get("direction") as "up" | "down";

    if (
      !userIdStr ||
      !direction ||
      (direction !== "up" && direction !== "down")
    ) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await adjustDraftingOrder(db, userId, direction);
      return {
        success: true,
        message: `Draft order updated`,
      };
    } catch (error) {
      console.error("Error adjusting draft order:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to adjust draft order",
      };
    }
  }

  if (intent === "delete-user") {
    const userIdStr = formData.get("userId");
    const userName = formData.get("userName");

    if (!userIdStr || !userName) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await deleteUser(db, userId);
      return {
        success: true,
        message: `User "${userName}" deleted successfully`,
      };
    } catch (error) {
      console.error("Error deleting user:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete user",
      };
    }
  }

  if (intent === "create-user") {
    const name = formData.get("name") as string;
    const role = formData.get("role") as "admin" | "user";
    const discordSnowflake = formData.get("discordSnowflake") as string;

    if (!name || !role || !discordSnowflake) {
      return { success: false, message: "All fields are required" };
    }

    if (role !== "admin" && role !== "user") {
      return { success: false, message: "Invalid role" };
    }

    try {
      await createUser(db, name, role, discordSnowflake);
      return {
        success: true,
        message: `User "${name}" created successfully`,
      };
    } catch (error) {
      console.error("Error creating user:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create user. Discord snowflake may already be in use.",
      };
    }
  }

  if (intent === "set-current-drafting-user") {
    const userIdStr = formData.get("userId");
    const userName = formData.get("userName");

    if (!userIdStr || !userName) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await setCurrentDraftingUser(db, userId);
      return {
        success: true,
        message: `Set "${userName}" as the current drafting user`,
      };
    } catch (error) {
      console.error("Error setting current drafting user:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to set current drafting user",
      };
    }
  }

  if (intent === "impersonate-user") {
    const userIdStr = formData.get("userId");
    const userName = formData.get("userName");

    if (!userIdStr || !userName) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await impersonateUser(request, userId);
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.error("Error impersonating user:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to impersonate user",
      };
    }
  }

  if (intent === "create-match") {
    const teamAIdStr = formData.get("teamAId");
    const teamBIdStr = formData.get("teamBId");
    const scheduledDateStr = formData.get("scheduledDate") as string;

    if (!teamAIdStr || !teamBIdStr) {
      return { success: false, message: "Both teams are required" };
    }

    const teamAId = parseInt(teamAIdStr as string, 10);
    const teamBId = parseInt(teamBIdStr as string, 10);

    if (isNaN(teamAId) || isNaN(teamBId)) {
      return { success: false, message: "Invalid team IDs" };
    }

    if (teamAId === teamBId) {
      return { success: false, message: "Team A and Team B must be different" };
    }

    try {
      const scheduledDate = scheduledDateStr
        ? new Date(scheduledDateStr)
        : null;
      await createMatch(db, { teamAId, teamBId, scheduledDate });
      return {
        success: true,
        message: "Match created successfully",
      };
    } catch (error) {
      console.error("Error creating match:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create match",
      };
    }
  }

  if (intent === "delete-match") {
    const matchIdStr = formData.get("matchId");

    if (!matchIdStr) {
      return { success: false, message: "Match ID is required" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    try {
      await deleteMatch(db, matchId);
      return {
        success: true,
        message: "Match deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting match:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete match",
      };
    }
  }

  if (intent === "update-match-state") {
    const matchIdStr = formData.get("matchId");
    const state = formData.get("state") as MatchState;

    if (!matchIdStr || !state) {
      return { success: false, message: "Match ID and state are required" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    if (!(matchState.enumValues as readonly string[]).includes(state)) {
      return { success: false, message: "Invalid match state" };
    }

    try {
      const currentSeason = await getSeasonState(db);
      await updateMatchState(db, matchId, state, {
        userId: user.id,
        seasonId: currentSeason?.id ?? 1,
      });
      return {
        success: true,
        message: `Match state updated to: ${state}`,
      };
    } catch (error) {
      console.error("Error updating match state:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update match state",
      };
    }
  }

  if (intent === "update-match-score") {
    const matchIdStr = formData.get("matchId");
    const teamAScoreStr = formData.get("teamAScore");
    const teamBScoreStr = formData.get("teamBScore");

    if (!matchIdStr) {
      return { success: false, message: "Match ID is required" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    const teamAScore = teamAScoreStr
      ? parseInt(teamAScoreStr as string, 10)
      : 0;
    const teamBScore = teamBScoreStr
      ? parseInt(teamBScoreStr as string, 10)
      : 0;

    if (isNaN(teamAScore) || isNaN(teamBScore)) {
      return { success: false, message: "Invalid scores" };
    }

    try {
      await updateMatchScore(db, matchId, teamAScore, teamBScore);
      return {
        success: true,
        message: "Match score updated successfully",
      };
    } catch (error) {
      console.error("Error updating match score:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update match score",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

export default function Admin({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-4">
      {actionData?.message && (
        <div
          className={`p-4 rounded mb-4 ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      <div>
        <Link
          to="/admin/match-track"
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
        >
          Match Track
        </Link>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold mb-2">Season State</h2>
        <div className="flex flex-col gap-2">
          <p className="mb-2">
            Current state:{" "}
            <span className="font-semibold">
              {loaderData.seasonState?.state || "Not set"}
            </span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {seasonState.enumValues.map((state) => (
              <Form key={state} method="post" className="inline-block">
                <input type="hidden" name="intent" value="set-season-state" />
                <input type="hidden" name="state" value={state} />
                <button
                  type="submit"
                  className={`px-4 py-2 rounded ${
                    loaderData.seasonState?.state === state
                      ? "bg-gray-700 text-white"
                      : "bg-gray-500 hover:bg-gray-600 text-white"
                  }`}
                >
                  Set to {state}
                </button>
              </Form>
            ))}
          </div>
          <p>Note: Switching to drafting will clear all lineups!</p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Team Management</h2>

          <Form method="post" className="inline-block mr-4">
            <input type="hidden" name="intent" value="wipe-teams" />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Wipe All Teams
            </button>
          </Form>

          <Form method="post" className="inline-block mr-4">
            <input type="hidden" name="intent" value="wipe-trades" />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Wipe All Trades
            </button>
          </Form>

          <Form method="post" className="inline-block mr-4">
            <input type="hidden" name="intent" value="random-assign-players" />
            <button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded"
            >
              Randomly Assign Players
            </button>
          </Form>

          <Form method="post" className="inline-block mr-4">
            <input
              type="hidden"
              name="intent"
              value="random-assign-draft-order"
            />
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Randomly Assign Draft Order
            </button>
          </Form>

          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="create-draft-entries" />
            <button
              type="submit"
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded"
            >
              Add All Users to Season
            </button>
          </Form>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Drafting Order</h2>
          {loaderData.draftingOrder.length === 0 ? (
            <p className="text-gray-200">No users in drafting order</p>
          ) : (
            <div className="space-y-2">
              {loaderData.draftingOrder.map((item, index) => (
                <div
                  key={item.userId}
                  className="flex items-center gap-4 p-2 border rounded bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 transition-colors"
                >
                  <span className="font-semibold w-8">
                    {item.draftingTurn}.
                  </span>
                  <span className="flex-1 flex items-center gap-2">
                    {item.userName}
                    {loaderData.seasonState?.currentDraftingUserId ===
                      item.userId && (
                      <span className="text-sm italic">
                        (Currently Drafting)
                      </span>
                    )}
                  </span>
                  <div className="flex gap-8 items-center">
                    <Form method="post" className="inline-block">
                      <input
                        type="hidden"
                        name="intent"
                        value="impersonate-user"
                      />
                      <input type="hidden" name="userId" value={item.userId} />
                      <input
                        type="hidden"
                        name="userName"
                        value={item.userName}
                      />
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm"
                      >
                        Impersonate
                      </button>
                    </Form>
                    <Form method="post" className="inline-block">
                      <input type="hidden" name="intent" value="delete-user" />
                      <input type="hidden" name="userId" value={item.userId} />
                      <input
                        type="hidden"
                        name="userName"
                        value={item.userName}
                      />
                      <button
                        type="submit"
                        className="opacity-50 hover:opacity-100 cursor-pointer bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                      >
                        Delete
                      </button>
                    </Form>
                    {loaderData.seasonState?.state === "drafting" && (
                      <Form method="post" className="inline-block">
                        <input
                          type="hidden"
                          name="intent"
                          value="set-current-drafting-user"
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={item.userId}
                        />
                        <input
                          type="hidden"
                          name="userName"
                          value={item.userName}
                        />
                        <button
                          type="submit"
                          className={`px-3 py-1 rounded text-sm ${
                            loaderData.seasonState?.currentDraftingUserId ===
                            item.userId
                              ? "bg-blue-700 text-white cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                          disabled={
                            loaderData.seasonState?.currentDraftingUserId ===
                            item.userId
                          }
                        >
                          Set as Drafting
                        </button>
                      </Form>
                    )}
                    <div className="flex gap-2">
                      <Form method="post" className="inline-block">
                        <input
                          type="hidden"
                          name="intent"
                          value="adjust-draft-order"
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={item.userId}
                        />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={index === 0}
                          className={`px-2 py-1 rounded cursor-pointer ${
                            index === 0
                              ? "bg-gray-500 text-gray-100 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700 text-white"
                          }`}
                        >
                          +
                        </button>
                      </Form>
                      <Form method="post" className="inline-block">
                        <input
                          type="hidden"
                          name="intent"
                          value="adjust-draft-order"
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={item.userId}
                        />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={
                            index === loaderData.draftingOrder.length - 1
                          }
                          className={`px-2 py-1 rounded cursor-pointer ${
                            index === loaderData.draftingOrder.length - 1
                              ? "bg-gray-500 text-gray-100 cursor-not-allowed"
                              : "bg-red-600 hover:bg-red-700 text-white"
                          }`}
                        >
                          -
                        </button>
                      </Form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <h2 className="text-xl font-semibold mb-2">Add New User</h2>
        <div className="bg-cell-gray/40 rounded-md border border-cell-gray/50 p-6">
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="create-user" />
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="px-3 py-2 border rounded bg-white text-black border-gray-300"
                placeholder="User name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="role"
                name="role"
                required
                className="px-3 py-2 border rounded bg-white text-black border-gray-300"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="discordSnowflake" className="text-sm font-medium">
                Discord Snowflake
              </label>
              <input
                type="text"
                id="discordSnowflake"
                name="discordSnowflake"
                required
                className="px-3 py-2 border rounded bg-white text-black border-gray-300"
                placeholder="Right-click on user in Discord (dev mode enabled) → Copy User ID"
              />
            </div>
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              Create User
            </button>
          </Form>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Match Management</h2>

          <div className="bg-cell-gray/40 rounded-md border border-cell-gray/50 p-6 mb-4">
            <h3 className="text-lg font-medium mb-3">Create New Match</h3>
            <Form method="post" className="flex flex-wrap gap-4 items-end">
              <input type="hidden" name="intent" value="create-match" />
              <div className="flex flex-col gap-2">
                <label htmlFor="teamAId" className="text-sm font-medium">
                  Team A
                </label>
                <select
                  id="teamAId"
                  name="teamAId"
                  required
                  className="px-3 py-2 border rounded bg-white text-black border-gray-300 min-w-[200px]"
                >
                  <option value="">Select Team A</option>
                  {loaderData.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {formatTeamName(team)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="teamBId" className="text-sm font-medium">
                  Team B
                </label>
                <select
                  id="teamBId"
                  name="teamBId"
                  required
                  className="px-3 py-2 border rounded bg-white text-black border-gray-300 min-w-[200px]"
                >
                  <option value="">Select Team B</option>
                  {loaderData.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {formatTeamName(team)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="scheduledDate" className="text-sm font-medium">
                  Scheduled Date/Time (optional)
                </label>
                <input
                  type="datetime-local"
                  id="scheduledDate"
                  name="scheduledDate"
                  className="px-3 py-2 border rounded bg-white text-black border-gray-300"
                />
              </div>
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Create Match
              </button>
            </Form>
          </div>

          {loaderData.matches.length === 0 ? (
            <p className="text-gray-200">No matches created yet</p>
          ) : (
            <div className="space-y-2">
              {loaderData.matches.map((match) => (
                <div
                  key={match.id}
                  className="flex flex-wrap items-center gap-4 p-3 border rounded bg-cell-gray/40 border-cell-gray/50"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">
                      {formatTeamName(match.teamA)} vs {formatTeamName(match.teamB)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {match.scheduledDate
                        ? new Date(match.scheduledDate).toLocaleString()
                        : "No date set"}
                    </div>
                    {match.state === "finished" &&
                      match.teamAScore !== null &&
                      match.teamBScore !== null && (
                        <div className="text-sm text-yellow-300">
                          Score: {match.teamAScore} - {match.teamBScore}
                        </div>
                      )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded capitalize ${
                        match.state === "upcoming"
                          ? "bg-blue-500/20 text-blue-300"
                          : match.state === "live"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-gray-500/20 text-gray-300"
                      }`}
                    >
                      {match.state}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {matchState.enumValues.map((state) => (
                      <Form key={state} method="post" className="inline-block">
                        <input
                          type="hidden"
                          name="intent"
                          value="update-match-state"
                        />
                        <input type="hidden" name="matchId" value={match.id} />
                        <input type="hidden" name="state" value={state} />
                        <button
                          type="submit"
                          disabled={match.state === state}
                          className={`px-2 py-1 rounded text-xs ${
                            match.state === state
                              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                              : "bg-gray-500 hover:bg-gray-600 text-white"
                          }`}
                        >
                          {state}
                        </button>
                      </Form>
                    ))}
                  </div>

                  {match.state === "finished" && (
                    <>
                      <Form method="post" className="flex items-center gap-2">
                        <input
                          type="hidden"
                          name="intent"
                          value="update-match-score"
                        />
                        <input type="hidden" name="matchId" value={match.id} />
                        <input
                          type="number"
                          name="teamAScore"
                          defaultValue={match.teamAScore ?? 0}
                          min="0"
                          className="w-16 px-2 py-1 border rounded bg-white text-black border-gray-300 text-center"
                          placeholder="A"
                        />
                        <span>-</span>
                        <input
                          type="number"
                          name="teamBScore"
                          defaultValue={match.teamBScore ?? 0}
                          min="0"
                          className="w-16 px-2 py-1 border rounded bg-white text-black border-gray-300 text-center"
                          placeholder="B"
                        />
                        <button
                          type="submit"
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-sm"
                        >
                          Save
                        </button>
                      </Form>
                      <Link
                        to={`/admin/match/${match.id}/stats`}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-sm"
                      >
                        Edit Stats
                      </Link>
                    </>
                  )}

                  <Form method="post" className="inline-block">
                    <input type="hidden" name="intent" value="delete-match" />
                    <input type="hidden" name="matchId" value={match.id} />
                    <button
                      type="submit"
                      className="opacity-50 hover:opacity-100 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm"
                    >
                      Delete
                    </button>
                  </Form>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
