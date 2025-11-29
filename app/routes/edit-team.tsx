import type { Route } from "./+types/edit-team";
import { db } from "~/database/db";
import { getUser } from "~/auth.server";
import { useSubmit, redirect, Form } from "react-router";
import { useRef, useState } from "react";
import { LineupEditor } from "~/components/LineupEditor";
import {
  getTeamWithPlayers,
  fillPlayersToTeamSize,
  checkCanEdit,
  updateTeamName,
  updateTeamLineup,
  updateTeamTradePreferences,
  type LineupEntry,
} from "~/utils/team.server";

async function getTeamWithPermissionCheck(teamId: string, request: Request) {
  const user = await getUser(request);

  const team = await getTeamWithPlayers(teamId);

  const canEdit = checkCanEdit(user, team.userId);

  if (!canEdit) {
    throw new Response("You do not have permission to edit this team", {
      status: 403,
    });
  }

  return { team, user, db };
}

export async function loader({
  params: { teamId },
  request,
}: Route.LoaderArgs) {
  const { team } = await getTeamWithPermissionCheck(teamId, request);

  const filledPlayers = fillPlayersToTeamSize(team.players);
  const teamWithFullPlayers = { ...team, players: filledPlayers };

  return { team: teamWithFullPlayers };
}

export async function action({
  params: { teamId },
  request,
}: Route.ActionArgs) {
  const { db, team } = await getTeamWithPermissionCheck(teamId, request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-name") {
    const name = formData.get("name");
    return await updateTeamName(
      db,
      teamId,
      typeof name === "string" ? name : null,
    );
  }

  if (intent === "update-lineup") {
    // Parse lineup entries from form data
    // Form data format: entries[0][playerId], entries[0][fieldingPosition], entries[0][battingOrder], etc.
    const lineupEntries: LineupEntry[] = [];
    const entryKeys = new Set<string>();

    // Collect all entry indices
    for (const [key] of formData.entries()) {
      const match = key.match(/^entries\[(\d+)\]\[(\w+)\]$/);
      if (match) {
        entryKeys.add(match[1]);
      }
    }

    // Build lineup entries
    for (const index of entryKeys) {
      const playerIdStr = formData.get(`entries[${index}][playerId]`);
      const fieldingPosition = formData.get(
        `entries[${index}][fieldingPosition]`,
      );
      const battingOrderStr = formData.get(`entries[${index}][battingOrder]`);

      if (!playerIdStr) {
        return {
          success: false,
          message: `Missing playerId for entry ${index}`,
        };
      }

      const playerId = parseInt(playerIdStr as string, 10);
      if (isNaN(playerId)) {
        return {
          success: false,
          message: `Invalid playerId for entry ${index}`,
        };
      }

      lineupEntries.push({
        playerId,
        fieldingPosition:
          fieldingPosition && fieldingPosition !== "bench"
            ? (fieldingPosition as LineupEntry["fieldingPosition"])
            : null,
        battingOrder:
          battingOrderStr && battingOrderStr !== "none"
            ? parseInt(battingOrderStr as string, 10)
            : null,
      });
    }

    const result = await updateTeamLineup(
      db,
      teamId,
      lineupEntries,
      team.captainId,
    );
    if (result.success) {
      throw redirect(`/team/${teamId}`);
    }
    return result;
  }

  if (intent === "update-trade-preferences") {
    const lookingFor = formData.get("lookingFor");
    const willingToTrade = formData.get("willingToTrade");
    return await updateTeamTradePreferences(
      db,
      teamId,
      typeof lookingFor === "string" ? lookingFor : null,
      typeof willingToTrade === "string" ? willingToTrade : null,
    );
  }

  return { success: false, message: "Invalid action" };
}

export default function EditTeam({
  loaderData: { team },
  actionData,
}: Route.ComponentProps) {
  const submit = useSubmit();
  const [isEditing, setIsEditing] = useState(false);
  const [optimisticName, setOptimisticName] = useState(team.name);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [lookingFor, setLookingFor] = useState(team.lookingFor ?? "");
  const [willingToTrade, setWillingToTrade] = useState(
    team.willingToTrade ?? "",
  );

  // Create a key based on lineup data - when lineup changes after save, component remounts
  const lineupKey = team.players
    .filter((p) => p !== null)
    .map(
      (p) =>
        `${p.id}-${p.lineup?.fieldingPosition ?? "bench"}-${p.lineup?.battingOrder ?? "none"}`,
    )
    .join("|");

  const handleTitleBlur = () => {
    setIsEditing(false);
    const newName = titleRef.current?.textContent?.trim();

    if (newName && newName !== team.name) {
      setOptimisticName(newName);
      submit({ intent: "update-name", name: newName }, { method: "post" });
    } else if (titleRef.current) {
      titleRef.current.textContent = team.name;
      setOptimisticName(team.name);
    }
  };

  const handleTitleFocus = () => {
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleRef.current?.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (titleRef.current) {
        titleRef.current.textContent = team.name;
        setOptimisticName(team.name);
      }
      titleRef.current?.blur();
    }
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      {actionData?.message && (
        <div className="text-red-200 bg-red-900/40 rounded-lg p-4">
          {actionData.message}
        </div>
      )}
      <h1
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        className={`text-2xl font-rodin font-bold outline-none border-2 border-transparent ${
          isEditing
            ? "bg-blue-50/75 px-2 py-1 rounded border-2 border-blue-300"
            : "hover:bg-blue-50/50 px-2 py-1 rounded"
        }`}
        onBlur={handleTitleBlur}
        onFocus={handleTitleFocus}
        onKeyDown={handleKeyDown}
      >
        {optimisticName}
      </h1>

      <div className="flex flex-col gap-4 w-full">
        <LineupEditor key={lineupKey} team={team} />
      </div>

      {/* Trade Preferences Section */}
      <div className="flex flex-col gap-3 border border-cell-gray/50 bg-cell-gray/30 rounded-lg p-4 w-full max-w-2xl">
        <h2 className="text-lg font-bold text-center">Trade Block</h2>
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="update-trade-preferences" />
          <div className="flex flex-col gap-2">
            <label
              htmlFor="lookingFor"
              className="text-sm font-semibold text-green-400"
            >
              Looking For:
            </label>
            <textarea
              id="lookingFor"
              name="lookingFor"
              value={lookingFor}
              onChange={(e) => setLookingFor(e.target.value)}
              placeholder="Describe what players/positions you're looking for..."
              className="w-full p-2 text-sm border border-cell-gray/50 bg-cell-gray/20 rounded-md text-white placeholder-gray-500 resize-y min-h-[60px]"
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="willingToTrade"
              className="text-sm font-semibold text-orange-400"
            >
              Willing to Trade:
            </label>
            <textarea
              id="willingToTrade"
              name="willingToTrade"
              value={willingToTrade}
              onChange={(e) => setWillingToTrade(e.target.value)}
              placeholder="List players you're willing to trade..."
              className="w-full p-2 text-sm border border-cell-gray/50 bg-cell-gray/20 rounded-md text-white placeholder-gray-500 resize-y min-h-[60px]"
              rows={2}
            />
          </div>
          <button
            type="submit"
            className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm self-start"
          >
            Save Trade Preferences
          </button>
        </Form>
      </div>
    </div>
  );
}
