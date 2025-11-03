import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin";
import { requireUser } from "~/auth.server";
import { database } from "~/database/context";
import { players, seasonState, type SeasonState } from "~/database/schema";
import {
  randomAssignTeams,
  wipeTeams,
  getSeasonState,
  setSeasonState,
  getDraftingOrder,
  adjustDraftingOrder,
  randomAssignDraftOrder,
  createDraftEntriesForAllUsers,
  deleteUser,
  createUser,
  setCurrentDraftingUser,
} from "~/utils/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const db = database();
  const currentState = await getSeasonState(db);
  const draftingOrder = await getDraftingOrder(db);

  return {
    user,
    seasonState: currentState,
    draftingOrder,
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
      `Are you sure you want to change the season state to "${state}"?`
    );
    if (!confirmed) {
      return { success: false, message: "State change cancelled" };
    }
  }

  if (intent === "wipe-teams") {
    const confirmed = confirm(
      "Are you sure you want to remove all players from teams? This cannot be undone."
    );
    if (!confirmed) {
      return { success: false, message: "Team wipe cancelled" };
    }
  }

  if (intent === "create-draft-entries") {
    const confirmed = confirm(
      "Are you sure you want to add all users to the current season's draft order?"
    );
    if (!confirmed) {
      return { success: false, message: "Draft entry creation cancelled" };
    }
  }

  if (intent === "random-assign-players") {
    const confirmed = confirm(
      "Are you sure you want to randomly assign players to teams?"
    );
    if (!confirmed) {
      return { success: false, message: "Player assignment cancelled" };
    }
  }

  if (intent === "random-assign-draft-order") {
    const confirmed = confirm(
      "Are you sure you want to randomly assign the draft order?"
    );
    if (!confirmed) {
      return { success: false, message: "Draft order randomization cancelled" };
    }
  }

  if (intent === "delete-user") {
    const userId = formData.get("userId");
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to delete user "${userName}"? This will also delete their team, remove players from their team, and cannot be undone.`
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
      `Are you sure you want to set "${userName}" as the current drafting user?`
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
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
  const db = database();

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
      await setSeasonState(db, state);
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
      </div>
    </div>
  );
}
