import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin.debug";
import { requireUser } from "~/auth.server";
import { db } from "~/database/db";
import { type SeasonState } from "~/database/schema";
import {
  getSeasonState,
  setSeasonState,
  wipeTeams,
  wipeTrades,
  randomAssignTeams,
  randomAssignDraftOrder,
  createDraftEntriesForAllUsers,
} from "~/utils/admin.server";

const isProduction = process.env.NODE_ENV === "production";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const seasonState = await getSeasonState(db);

  return {
    user,
    seasonState,
    isProduction,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "wipe-teams") {
    const confirmed = confirm(
      "Are you sure you want to wipe all team assignments? This will unassign all players from all teams and clear lineups.",
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "wipe-trades") {
    const confirmed = confirm(
      "Are you sure you want to wipe all trades? This will delete all trade records.",
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "random-assign-teams") {
    const confirmed = confirm(
      "Are you sure you want to randomly assign unassigned players to teams? This will also generate random lineups.",
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "random-draft-order") {
    const confirmed = confirm(
      "Are you sure you want to randomize the draft order?",
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "set-season-state") {
    const newState = formData.get("state") as SeasonState;
    const currentState = formData.get("currentState") as SeasonState | null;

    let message = `Are you sure you want to change the season state to "${newState}"?`;

    if (currentState === "pre-season" && newState === "drafting") {
      message +=
        "\n\nThis will:\n- Clear all team assignments\n- Clear all lineups\n- Set the first user in draft order as the current drafter";
    }

    const confirmed = confirm(message);
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  return await serverAction();
}

// Dangerous intents that should be blocked in production
const dangerousIntents = [
  "wipe-teams",
  "wipe-trades",
  "random-assign-teams",
  "random-draft-order",
];

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Block dangerous operations in production
  if (isProduction && dangerousIntents.includes(intent as string)) {
    return {
      success: false,
      message: "This operation is disabled in production",
    };
  }

  if (intent === "set-season-state") {
    const newState = formData.get("state") as SeasonState;

    if (!newState) {
      return { success: false, message: "Invalid state" };
    }

    try {
      await setSeasonState(db, newState, user.id);
      return { success: true, message: `Season state set to "${newState}"` };
    } catch (error) {
      console.error("Error setting season state:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to set season state",
      };
    }
  }

  if (intent === "wipe-teams") {
    try {
      await wipeTeams(db);
      return {
        success: true,
        message: "All team assignments and lineups have been wiped",
      };
    } catch (error) {
      console.error("Error wiping teams:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to wipe teams",
      };
    }
  }

  if (intent === "wipe-trades") {
    try {
      await wipeTrades(db);
      return { success: true, message: "All trades have been wiped" };
    } catch (error) {
      console.error("Error wiping trades:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to wipe trades",
      };
    }
  }

  if (intent === "random-assign-teams") {
    try {
      await randomAssignTeams(db);
      return {
        success: true,
        message: "Players randomly assigned to teams with lineups generated",
      };
    } catch (error) {
      console.error("Error randomly assigning teams:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to randomly assign teams",
      };
    }
  }

  if (intent === "random-draft-order") {
    try {
      await randomAssignDraftOrder(db);
      return { success: true, message: "Draft order has been randomized" };
    } catch (error) {
      console.error("Error randomizing draft order:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to randomize draft order",
      };
    }
  }

  if (intent === "add-all-users-to-season") {
    try {
      await createDraftEntriesForAllUsers(db);
      return {
        success: true,
        message: "All users have been added to the current season",
      };
    } catch (error) {
      console.error("Error adding users to season:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to add users to season",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

export default function AdminDebug({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const states: SeasonState[] = [
    "pre-season",
    "drafting",
    "playing",
    "post-season",
  ];

  return (
    <div className="flex flex-col gap-6">
      {actionData?.message && (
        <div
          className={`p-4 rounded ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      {/* Season State */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4">Season State</h2>
        <p className="text-gray-400 mb-4">
          Current state:{" "}
          <span className="font-semibold text-white">
            {loaderData.seasonState?.state || "Not set"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {states.map((state) => (
            <Form key={state} method="post" className="inline-block">
              <input type="hidden" name="intent" value="set-season-state" />
              <input type="hidden" name="state" value={state} />
              <input
                type="hidden"
                name="currentState"
                value={loaderData.seasonState?.state || ""}
              />
              <button
                type="submit"
                disabled={loaderData.seasonState?.state === state}
                className={`px-4 py-2 rounded transition-colors ${
                  loaderData.seasonState?.state === state
                    ? "bg-blue-700 text-white cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                }`}
              >
                {state}
              </button>
            </Form>
          ))}
        </div>
      </div>

      {/* Wipe Operations */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4 text-red-400">
          Danger Zone: Wipe Operations
        </h2>
        <p className="text-gray-400 mb-4">
          These actions are destructive and cannot be undone.
          {loaderData.isProduction && (
            <span className="block text-red-400 mt-1">
              ⚠️ Disabled in production environment.
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-4">
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="wipe-teams" />
            <button
              type="submit"
              disabled={loaderData.isProduction}
              className={`px-4 py-2 rounded transition-colors ${
                loaderData.isProduction
                  ? "bg-red-900 text-red-300 cursor-not-allowed opacity-50"
                  : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              }`}
            >
              Wipe Team Assignments
            </button>
          </Form>
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="wipe-trades" />
            <button
              type="submit"
              disabled={loaderData.isProduction}
              className={`px-4 py-2 rounded transition-colors ${
                loaderData.isProduction
                  ? "bg-red-900 text-red-300 cursor-not-allowed opacity-50"
                  : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              }`}
            >
              Wipe Trades
            </button>
          </Form>
        </div>
      </div>

      {/* Random Operations */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4 text-yellow-400">
          Random Operations
        </h2>
        <p className="text-gray-400 mb-4">
          Useful for testing or quickly setting up data.
          {loaderData.isProduction && (
            <span className="block text-red-400 mt-1">
              ⚠️ Disabled in production environment.
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-4">
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="random-assign-teams" />
            <button
              type="submit"
              disabled={loaderData.isProduction}
              className={`px-4 py-2 rounded transition-colors ${
                loaderData.isProduction
                  ? "bg-yellow-900 text-yellow-300 cursor-not-allowed opacity-50"
                  : "bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
              }`}
            >
              Random Assign Players to Teams
            </button>
          </Form>
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="random-draft-order" />
            <button
              type="submit"
              disabled={loaderData.isProduction}
              className={`px-4 py-2 rounded transition-colors ${
                loaderData.isProduction
                  ? "bg-yellow-900 text-yellow-300 cursor-not-allowed opacity-50"
                  : "bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
              }`}
            >
              Randomize Draft Order
            </button>
          </Form>
        </div>
      </div>

      {/* Season Operations */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4">Season Operations</h2>
        <div className="flex flex-wrap gap-4">
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="add-all-users-to-season" />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white transition-colors cursor-pointer"
            >
              Add All Users to Season
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
