import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin";
import { requireUser } from "~/auth.server";
import { database } from "~/database/context";
import { players, teams, teamLineups } from "~/database/schema";
import { eq, isNull } from "drizzle-orm";
import { TEAM_SIZE, LINEUP_SIZE } from "~/consts";
import { randomAssignTeams, wipeTeams } from "~/utils/admin";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  return { user };
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

  return { success: false, message: "Invalid action" };
}

export default function Admin({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div>
      <h1>Admin Panel</h1>
      <p>Welcome, {loaderData.user.name}</p>

      {actionData?.message && (
        <div
          className={`p-4 rounded mb-4 ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Team Management</h2>

          <Form method="post" className="inline-block mr-4">
            <input type="hidden" name="intent" value="wipe-teams" />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              onClick={(e) => {
                if (
                  !confirm(
                    "Are you sure you want to remove all players from teams? This cannot be undone."
                  )
                ) {
                  e.preventDefault();
                }
              }}
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
