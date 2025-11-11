import type { Player, TeamLineup } from "~/database/schema";
import type { Route } from "./+types/edit-team";
import { database } from "~/database/context";
import { TeamPlayerList } from "~/components/TeamPlayerList";
import { getUser } from "~/auth.server";
import { useSubmit } from "react-router";
import { useRef, useState } from "react";
import { eq } from "drizzle-orm";
import { teams } from "~/database/schema";
import { TEAM_SIZE } from "~/consts";
import { Field } from "~/components/Field";

async function getTeamWithPermissionCheck(teamId: string, request: Request) {
  const user = await getUser(request);
  const db = database();

  const team = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.id, Number(teamId)),
    with: {
      players: {
        with: {
          lineup: true,
        },
      },
    },
  });

  if (!team) {
    throw new Response("Team not found", { status: 404 });
  }

  const canEdit = user?.id === team.userId || user?.role === "admin";

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

  const filledPlayers: ((typeof team.players)[number] | null)[] = [
    ...team.players,
  ];
  while (filledPlayers.length < TEAM_SIZE) {
    filledPlayers.push(null);
  }
  const teamWithFullPlayers = { ...team, players: filledPlayers };

  return { team: teamWithFullPlayers };
}

export async function action({
  params: { teamId },
  request,
}: Route.ActionArgs) {
  const { db } = await getTeamWithPermissionCheck(teamId, request);

  const formData = await request.formData();
  const name = formData.get("name");

  if (typeof name === "string" && name.trim()) {
    if (name.trim().length > 29) {
      return {
        success: false,
        message: "Name must be less than 30 characters",
      };
    }

    console.log(name.trim(), name.trim().length);

    await db
      .update(teams)
      .set({ name: name.trim() })
      .where(eq(teams.id, Number(teamId)));
  }

  return { success: true };
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
      submit({ name: newName }, { method: "post" });
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
        <Field players={team.players.filter((player) => player !== null)} />
      </div>
    </div>
  );
}
