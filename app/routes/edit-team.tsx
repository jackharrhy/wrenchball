import type { Route } from "./+types/edit-team";
import { db } from "~/database/db";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { getUser } from "~/auth.server";
import { useSubmit } from "react-router";
import { useRef, useState } from "react";
import { Lineup } from "~/components/Lineup";
import {
  getTeamWithPlayers,
  fillPlayersToTeamSize,
  checkCanEdit,
  updateTeamName,
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
  const { db } = await getTeamWithPermissionCheck(teamId, request);

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

      <div
        key={team.id}
        className="flex flex-row items-center gap-16 border-2 border-cell-gray/50 bg-cell-gray/40 rounded-lg p-4"
      >
        <TeamPlayerList team={team} />
        <Lineup
          players={team.players.filter((player) => player !== null)}
          captainId={team.captainId}
          captainStatsCharacter={team.captain?.statsCharacter}
        />
      </div>
    </div>
  );
}
