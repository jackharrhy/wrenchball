import type { Route } from "./+types/edit-team";
import { db } from "~/database/db";
import { getUser } from "~/auth.server";
import { useSubmit, redirect } from "react-router";
import { useRef, useState } from "react";
import { LineupEditor } from "~/components/LineupEditor";
import { MentionEditor } from "~/components/MentionEditor";
import {
  getTeamWithPlayers,
  fillPlayersToTeamSize,
  checkCanEdit,
  updateTeamName,
  updateTeamLineup,
  updateTeamTradePreferences,
  type LineupEntry,
} from "~/utils/team.server";
import {
  teams as teamsTable,
  players as playersTable,
} from "~/database/schema";

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

  // Fetch all teams and players for mention suggestions
  const allTeams = await db
    .select({ id: teamsTable.id, name: teamsTable.name })
    .from(teamsTable);
  const allPlayers = await db
    .select({ id: playersTable.id, name: playersTable.name })
    .from(playersTable);

  return {
    team: {
      ...teamWithFullPlayers,
    },
    allTeams,
    allPlayers,
  };
}

export async function action({
  params: { teamId },
  request,
}: Route.ActionArgs) {
  const { db, team, user } = await getTeamWithPermissionCheck(teamId, request);

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
      const isStarredStr = formData.get(`entries[${index}][isStarred]`);

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
        isStarred: isStarredStr === "true",
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
    const result = await updateTeamTradePreferences(
      db,
      teamId,
      user!.id,
      typeof lookingFor === "string" ? lookingFor : null,
      typeof willingToTrade === "string" ? willingToTrade : null,
    );
    if (result.success) {
      throw redirect(`/team/${teamId}`);
    }
    return result;
  }

  return { success: false, message: "Invalid action" };
}

export default function EditTeam({
  loaderData: { team, allTeams, allPlayers },
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

  const handleSaveTradePreferences = () => {
    submit(
      {
        intent: "update-trade-preferences",
        lookingFor,
        willingToTrade,
      },
      { method: "post" },
    );
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

      <div className="flex flex-col gap-3 border border-cell-gray/50 bg-cell-gray/30 rounded-lg p-4 w-full max-w-2xl">
        <h2 className="text-lg font-bold text-center">Trade Preferences</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-green-400">
              Looking For:
            </label>
            <MentionEditor
              content={lookingFor}
              onChange={setLookingFor}
              placeholder="Describe what players you're looking for..."
              teams={allTeams}
              players={allPlayers}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-orange-400">
              Willing to Trade:
            </label>
            <MentionEditor
              content={willingToTrade}
              onChange={setWillingToTrade}
              placeholder="List players you're willing to trade..."
              teams={allTeams}
              players={allPlayers}
            />
          </div>
          <p className="text-xs text-gray-400">
            Type @ to mention teams or players
          </p>
          <button
            type="button"
            onClick={handleSaveTradePreferences}
            className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm self-start cursor-pointer"
          >
            Save Trade Preferences
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full">
        <LineupEditor key={lineupKey} team={team} />
      </div>
    </div>
  );
}
