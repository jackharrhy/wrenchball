import type { Route } from "./+types/trade-with";
import { database } from "~/database/context";
import { requireUser } from "~/auth.server";
import { getSeasonState } from "~/utils/admin";
import { createTradeRequest } from "~/utils/trading";
import { PlayerIcon } from "~/components/PlayerIcon";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { useState } from "react";

export async function loader({
  params: { teamId },
  request,
}: Route.LoaderArgs) {
  const user = await requireUser(request);
  const db = database();
  const seasonState = await getSeasonState(db);

  if (seasonState?.state !== "playing") {
    return {
      error: `Season is in "${seasonState?.state || "unknown"}" state, trading is only available during playing state`,
      myTeam: null,
      otherTeam: null,
    };
  }

  const myTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.userId, user.id),
    with: {
      players: true,
    },
  });

  if (!myTeam) {
    return {
      error: "You do not have a team",
      myTeam: null,
      otherTeam: null,
    };
  }

  const otherTeamId = Number(teamId);
  if (isNaN(otherTeamId)) {
    throw new Response("Invalid team ID", { status: 400 });
  }

  const otherTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.id, otherTeamId),
    with: {
      players: true,
    },
  });

  if (!otherTeam) {
    throw new Response("Team not found", { status: 404 });
  }

  if (otherTeam.userId === user.id) {
    throw new Response("Cannot trade with your own team", { status: 400 });
  }

  return {
    error: null,
    myTeam,
    otherTeam,
  };
}

export async function action({
  params: { teamId },
  request,
}: Route.ActionArgs) {
  const user = await requireUser(request);
  const db = database();
  const formData = await request.formData();

  const fromPlayerIdsStr = formData.get("fromPlayerIds");
  const toPlayerIdsStr = formData.get("toPlayerIds");

  const fromPlayerIds =
    fromPlayerIdsStr && typeof fromPlayerIdsStr === "string"
      ? fromPlayerIdsStr
          .split(",")
          .map((id) => parseInt(id, 10))
          .filter((id) => !isNaN(id))
      : [];

  const toPlayerIds =
    toPlayerIdsStr && typeof toPlayerIdsStr === "string"
      ? toPlayerIdsStr
          .split(",")
          .map((id) => parseInt(id, 10))
          .filter((id) => !isNaN(id))
      : [];

  const otherTeamId = Number(teamId);
  if (isNaN(otherTeamId)) {
    return { success: false, error: "Invalid team ID" };
  }

  const otherTeam = await db.query.teams.findFirst({
    where: (teams, { eq }) => eq(teams.id, otherTeamId),
  });

  if (!otherTeam) {
    return { success: false, error: "Team not found" };
  }

  if (otherTeam.userId === user.id) {
    return { success: false, error: "Cannot trade with your own team" };
  }

  const result = await createTradeRequest(db, {
    fromUserId: user.id,
    toUserId: otherTeam.userId,
    fromPlayerIds,
    toPlayerIds,
  });

  if (result.success) {
    return redirect("/trading");
  }

  return { success: false, error: result.error || "Failed to create trade" };
}

function usePlayerSelection() {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);

  const togglePlayer = (playerId: number) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const clearSelection = () => {
    setSelectedPlayerIds([]);
  };

  return {
    selectedPlayerIds,
    togglePlayer,
    clearSelection,
  };
}

type TeamPlayerSelectionProps = {
  team: { players: (import("~/database/schema").Player | null)[] };
  title: string;
  selectedPlayerIds: number[];
  onTogglePlayer: (playerId: number) => void;
};

function TeamPlayerSelection({
  team,
  title,
  selectedPlayerIds,
  onTogglePlayer,
}: TeamPlayerSelectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-center">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {team.players.map((player) => {
          if (!player) return null;
          const isSelected = selectedPlayerIds.includes(player.id);
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onTogglePlayer(player.id)}
              className={`p-2 cursor-pointer transition-all border-1 border-cell-gray/50 bg-cell-gray/40 rounded-md ${
                isSelected
                  ? "ring-4 ring-blue-500 rounded-lg bg-cell-gray/60"
                  : "hover:bg-cell-gray/60"
              }`}
            >
              <PlayerIcon player={player} size="lg" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TradeWith({
  loaderData: { error, myTeam, otherTeam },
}: Route.ComponentProps) {
  const myTeamSelection = usePlayerSelection();
  const otherTeamSelection = usePlayerSelection();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (error) {
    return <div className="text-center text-gray-200 italic">{error}</div>;
  }

  if (!myTeam || !otherTeam) {
    return (
      <div className="text-center text-gray-200 italic">
        Team information not available
      </div>
    );
  }

  const canPropose =
    (myTeamSelection.selectedPlayerIds.length > 0 ||
      otherTeamSelection.selectedPlayerIds.length > 0) &&
    !isSubmitting;

  return (
    <div className="flex flex-col gap-6 items-center">
      <h1 className="text-2xl font-bold text-center">
        Trading with {otherTeam.name}
      </h1>

      {actionData?.error && (
        <div className="text-red-400 text-center bg-red-900/20 border border-red-500/50 rounded-md p-3">
          {actionData.error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-12 items-start">
        <TeamPlayerSelection
          team={myTeam}
          title="Your Team"
          selectedPlayerIds={myTeamSelection.selectedPlayerIds}
          onTogglePlayer={myTeamSelection.togglePlayer}
        />

        <TeamPlayerSelection
          team={otherTeam}
          title={otherTeam.name}
          selectedPlayerIds={otherTeamSelection.selectedPlayerIds}
          onTogglePlayer={otherTeamSelection.togglePlayer}
        />
      </div>

      <Form method="post">
        <input
          type="hidden"
          name="fromPlayerIds"
          value={myTeamSelection.selectedPlayerIds.join(",")}
        />
        <input
          type="hidden"
          name="toPlayerIds"
          value={otherTeamSelection.selectedPlayerIds.join(",")}
        />
        <button
          type="submit"
          disabled={!canPropose}
          className={`px-6 py-3 rounded-md font-semibold transition-all ${
            canPropose
              ? "bg-blue-800 hover:bg-blue-700 text-white cursor-pointer"
              : "bg-gray-600 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Proposing..." : "Propose Trade"}
        </button>
      </Form>
    </div>
  );
}
