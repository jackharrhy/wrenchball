import { redirect, Form, useFetcher } from "react-router";
import type { Route } from "./+types/admin.conferences";
import { requireUser } from "~/auth.server";
import { db } from "~/database/db";
import { teams, conferences } from "~/database/schema";
import { asc, eq } from "drizzle-orm";
import {
  getConferences,
  createConference,
  deleteConference,
  updateConference,
  assignTeamToConference,
} from "~/utils/admin.server";
import { useState, useRef } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const allConferences = await getConferences(db);
  const allTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      conferenceId: teams.conferenceId,
    })
    .from(teams)
    .orderBy(asc(teams.name));

  // Count teams per conference
  const conferencesWithCount = allConferences.map((conf) => ({
    ...conf,
    teamCount: allTeams.filter((t) => t.conferenceId === conf.id).length,
  }));

  return {
    user,
    conferences: conferencesWithCount,
    teams: allTeams,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "delete-conference") {
    const conferenceName = formData.get("conferenceName");
    const confirmed = confirm(
      `Are you sure you want to delete conference "${conferenceName}"? Teams in this conference will be unassigned.`,
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

  if (intent === "create-conference") {
    const name = formData.get("name") as string;
    const color = (formData.get("color") as string) || null;

    if (!name) {
      return { success: false, message: "Conference name is required" };
    }

    try {
      await createConference(db, name, color);
      return { success: true, message: `Created conference "${name}"` };
    } catch (error) {
      console.error("Error creating conference:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create conference",
      };
    }
  }

  if (intent === "delete-conference") {
    const conferenceIdStr = formData.get("conferenceId");

    if (!conferenceIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const conferenceId = parseInt(conferenceIdStr as string, 10);
    if (isNaN(conferenceId)) {
      return { success: false, message: "Invalid conference ID" };
    }

    try {
      await deleteConference(db, conferenceId);
      return { success: true, message: "Conference deleted" };
    } catch (error) {
      console.error("Error deleting conference:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete conference",
      };
    }
  }

  if (intent === "update-conference") {
    const conferenceIdStr = formData.get("conferenceId");
    const name = formData.get("name") as string | null;
    const color = formData.get("color") as string | null;

    if (!conferenceIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const conferenceId = parseInt(conferenceIdStr as string, 10);
    if (isNaN(conferenceId)) {
      return { success: false, message: "Invalid conference ID" };
    }

    try {
      const updates: { name?: string; color?: string | null } = {};
      if (name !== null) updates.name = name;
      if (color !== null) updates.color = color || null;

      await updateConference(db, conferenceId, updates);
      return { success: true, message: "Conference updated" };
    } catch (error) {
      console.error("Error updating conference:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update conference",
      };
    }
  }

  if (intent === "assign-team-conference") {
    const teamIdStr = formData.get("teamId");
    const conferenceIdStr = formData.get("conferenceId");

    if (!teamIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const teamId = parseInt(teamIdStr as string, 10);
    if (isNaN(teamId)) {
      return { success: false, message: "Invalid team ID" };
    }

    const conferenceId =
      conferenceIdStr && conferenceIdStr !== ""
        ? parseInt(conferenceIdStr as string, 10)
        : null;

    if (conferenceIdStr && conferenceIdStr !== "" && isNaN(conferenceId!)) {
      return { success: false, message: "Invalid conference ID" };
    }

    try {
      await assignTeamToConference(db, teamId, conferenceId);
      return {
        success: true,
        message: conferenceId
          ? "Team assigned to conference"
          : "Team removed from conference",
      };
    } catch (error) {
      console.error("Error assigning team to conference:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to assign team to conference",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

function ConferenceRow({
  conference,
}: {
  conference: { id: number; name: string; color: string | null; teamCount: number };
}) {
  const fetcher = useFetcher();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(conference.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleNameSave = () => {
    if (name !== conference.name) {
      fetcher.submit(
        {
          intent: "update-conference",
          conferenceId: conference.id.toString(),
          name,
        },
        { method: "post" },
      );
    }
    setEditingName(false);
  };

  const handleColorChange = (newColor: string) => {
    fetcher.submit(
      {
        intent: "update-conference",
        conferenceId: conference.id.toString(),
        color: newColor,
      },
      { method: "post" },
    );
  };

  return (
    <div className="flex items-center gap-4 p-3 border rounded bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 transition-colors">
      <div
        className="w-6 h-6 rounded border border-gray-600"
        style={{ backgroundColor: conference.color || "transparent" }}
      />
      <div className="flex-1">
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") {
                setName(conference.name);
                setEditingName(false);
              }
            }}
            className="px-2 py-1 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <span
            className="font-semibold cursor-pointer hover:underline"
            onClick={() => setEditingName(true)}
            title="Click to edit name"
          >
            {conference.name}
          </span>
        )}
        <span className="text-sm text-gray-400 ml-2">
          ({conference.teamCount} {conference.teamCount === 1 ? "team" : "teams"})
        </span>
      </div>
      <input
        type="color"
        value={conference.color || "#ffffff"}
        onChange={(e) => handleColorChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer"
        title="Change color"
      />
      <Form method="post" className="inline-block">
        <input type="hidden" name="intent" value="delete-conference" />
        <input type="hidden" name="conferenceId" value={conference.id} />
        <input type="hidden" name="conferenceName" value={conference.name} />
        <button
          type="submit"
          className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
        >
          Delete
        </button>
      </Form>
    </div>
  );
}

export default function AdminConferences({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      {actionData?.message && (
        <div
          className={`p-4 rounded ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      {/* Create Conference Form */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4">Create Conference</h2>
        <Form method="post" className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="intent" value="create-conference" />
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm text-gray-400">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Conference name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="color" className="text-sm text-gray-400">
              Color
            </label>
            <input
              type="color"
              id="color"
              name="color"
              defaultValue="#ffffff"
              className="w-12 h-10 rounded cursor-pointer"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            Create Conference
          </button>
        </Form>
      </div>

      {/* Conference List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Conferences</h2>
        {loaderData.conferences.length === 0 ? (
          <p className="text-gray-200">No conferences created yet</p>
        ) : (
          <div className="space-y-2">
            {loaderData.conferences.map((conf) => (
              <ConferenceRow key={conf.id} conference={conf} />
            ))}
          </div>
        )}
      </div>

      {/* Team Conference Assignments */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Team Assignments</h2>
        {loaderData.teams.length === 0 ? (
          <p className="text-gray-200">No teams found</p>
        ) : (
          <div className="space-y-2">
            {loaderData.teams.map((team) => (
              <div
                key={team.id}
                className="flex items-center gap-4 p-3 border rounded bg-cell-gray/40 border-cell-gray/50"
              >
                <span className="flex-1 font-medium">{team.name}</span>
                <Form method="post" className="flex items-center gap-2">
                  <input type="hidden" name="intent" value="assign-team-conference" />
                  <input type="hidden" name="teamId" value={team.id} />
                  <select
                    name="conferenceId"
                    defaultValue={team.conferenceId?.toString() || ""}
                    className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => e.target.form?.requestSubmit()}
                  >
                    <option value="">No Conference</option>
                    {loaderData.conferences.map((conf) => (
                      <option key={conf.id} value={conf.id}>
                        {conf.name}
                      </option>
                    ))}
                  </select>
                </Form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

