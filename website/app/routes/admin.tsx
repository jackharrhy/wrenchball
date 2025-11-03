import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin";
import { requireUser } from "~/auth.server";
import { database } from "~/database/context";
import { seasonStates, type SeasonStateValue } from "~/database/schema";
import {
  randomAssignTeams,
  wipeTeams,
  getSeasonState,
  setSeasonState,
} from "~/utils/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const db = database();
  const currentState = await getSeasonState(db);

  return { user, seasonState: currentState };
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

  if (intent === "random-assign") {
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

  if (intent === "set-season-state") {
    const state = formData.get("state") as SeasonStateValue;

    if (
      !state ||
      !(seasonStates.enumValues as readonly string[]).includes(state)
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
        <div>
          <h2 className="text-xl font-semibold mb-2">Season State</h2>
          <p className="mb-2">
            Current state:{" "}
            <span className="font-semibold">
              {loaderData.seasonState?.state || "Not set"}
            </span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {seasonStates.enumValues.map((state) => (
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

          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="random-assign" />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Randomly Assign Players
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
