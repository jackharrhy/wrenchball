import { redirect, Form, Link, useFetcher } from "react-router";
import type { Route } from "./+types/admin.matches";
import { requireUser } from "~/auth.server";
import { db } from "~/database/db";
import { matches, matchDays, teams, users } from "~/database/schema";
import { asc, eq } from "drizzle-orm";
import {
  getMatchDays,
  createMatchDay,
  updateMatchDay,
  deleteMatchDay,
  updateMatchDayOrder,
} from "~/utils/admin.server";
import {
  createMatch,
  updateMatchState,
  updateMatchScore,
  deleteMatch,
  getTeamsForMatchCreation,
  updateMatchOrder,
  getMatchLocations,
  updateMatchLocation,
} from "~/utils/matches.server";
import { useState } from "react";
import type { MatchState } from "~/database/schema";
import { formatLocationName } from "~/utils/location";

type BulkImportData = Record<string, [string, string][]>;

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const allMatchDays = await getMatchDays(db);

  // Get matches for each match day with team info
  const matchDaysWithMatches = await Promise.all(
    allMatchDays.map(async (matchDay) => {
      const dayMatches = await db.query.matches.findMany({
        where: eq(matches.matchDayId, matchDay.id),
        orderBy: [asc(matches.orderInDay)],
        with: {
          teamA: {
            with: {
              user: true,
            },
          },
          teamB: {
            with: {
              user: true,
            },
          },
          location: true,
        },
      });

      return {
        ...matchDay,
        matches: dayMatches,
      };
    }),
  );

  const teamsForCreation = await getTeamsForMatchCreation(db);
  const locations = await getMatchLocations(db);

  return {
    user,
    matchDays: matchDaysWithMatches,
    teams: teamsForCreation,
    locations,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "delete-match-day") {
    const matchDayName = formData.get("matchDayName");
    const confirmed = confirm(
      `Are you sure you want to delete match day "${matchDayName || "Unnamed"}"? All matches in this match day will also be deleted.`,
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "delete-match") {
    const confirmed = confirm(
      "Are you sure you want to delete this match? All match data will be lost.",
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

  // Match Day CRUD
  if (intent === "create-match-day") {
    const name = (formData.get("name") as string) || null;
    const dateStr = formData.get("date") as string;

    if (!dateStr) {
      return { success: false, message: "Date is required" };
    }

    try {
      const date = new Date(dateStr);
      await createMatchDay(db, name, date);
      return { success: true, message: `Created match day` };
    } catch (error) {
      console.error("Error creating match day:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create match day",
      };
    }
  }

  if (intent === "update-match-day") {
    const matchDayIdStr = formData.get("matchDayId");
    const name = formData.get("name") as string | null;
    const dateStr = formData.get("date") as string | null;

    if (!matchDayIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchDayId = parseInt(matchDayIdStr as string, 10);
    if (isNaN(matchDayId)) {
      return { success: false, message: "Invalid match day ID" };
    }

    try {
      const updates: { name?: string | null; date?: Date } = {};
      if (name !== null) updates.name = name || null;
      if (dateStr) updates.date = new Date(dateStr);

      await updateMatchDay(db, matchDayId, updates);
      return { success: true, message: "Match day updated" };
    } catch (error) {
      console.error("Error updating match day:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update match day",
      };
    }
  }

  if (intent === "delete-match-day") {
    const matchDayIdStr = formData.get("matchDayId");

    if (!matchDayIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchDayId = parseInt(matchDayIdStr as string, 10);
    if (isNaN(matchDayId)) {
      return { success: false, message: "Invalid match day ID" };
    }

    try {
      await deleteMatchDay(db, matchDayId);
      return { success: true, message: "Match day deleted" };
    } catch (error) {
      console.error("Error deleting match day:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete match day",
      };
    }
  }

  // Match CRUD
  if (intent === "create-match") {
    const teamAIdStr = formData.get("teamAId");
    const teamBIdStr = formData.get("teamBId");
    const matchDayIdStr = formData.get("matchDayId");
    const timeStr = formData.get("scheduledTime") as string | null;
    const locationIdStr = formData.get("locationId") as string | null;

    if (!teamAIdStr || !teamBIdStr || !matchDayIdStr) {
      return { success: false, message: "Missing required fields" };
    }

    const teamAId = parseInt(teamAIdStr as string, 10);
    const teamBId = parseInt(teamBIdStr as string, 10);
    const matchDayId = parseInt(matchDayIdStr as string, 10);
    const locationId = locationIdStr ? parseInt(locationIdStr, 10) : null;

    if (isNaN(teamAId) || isNaN(teamBId) || isNaN(matchDayId)) {
      return { success: false, message: "Invalid IDs" };
    }

    try {
      // Get the match day's date for the scheduled time
      const matchDay = await db.query.matchDays.findFirst({
        where: eq(matchDays.id, matchDayId),
      });

      let scheduledDate: Date | null = null;
      if (timeStr && matchDay && matchDay.date) {
        const [hours, minutes] = timeStr.split(":").map(Number);
        scheduledDate = new Date(matchDay.date);
        scheduledDate.setHours(hours, minutes, 0, 0);
      }

      await createMatch(db, {
        teamAId,
        teamBId,
        matchDayId,
        scheduledDate,
        locationId,
      });
      return { success: true, message: "Match created" };
    } catch (error) {
      console.error("Error creating match:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create match",
      };
    }
  }

  if (intent === "update-match-location") {
    const matchIdStr = formData.get("matchId");
    const locationIdStr = formData.get("locationId") as string | null;

    if (!matchIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    const locationId = locationIdStr ? parseInt(locationIdStr, 10) : null;

    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    try {
      await updateMatchLocation(db, matchId, locationId);
      return { success: true, message: "Location updated" };
    } catch (error) {
      console.error("Error updating match location:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update location",
      };
    }
  }

  if (intent === "update-match-state") {
    const matchIdStr = formData.get("matchId");
    const newState = formData.get("state") as MatchState;

    if (!matchIdStr || !newState) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    try {
      await updateMatchState(db, matchId, newState, {
        userId: user.id,
        seasonId: 1,
      });
      return { success: true, message: `Match state updated to ${newState}` };
    } catch (error) {
      console.error("Error updating match state:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update match state",
      };
    }
  }

  if (intent === "update-match-score") {
    const matchIdStr = formData.get("matchId");
    const teamAScoreStr = formData.get("teamAScore");
    const teamBScoreStr = formData.get("teamBScore");

    if (!matchIdStr || teamAScoreStr === null || teamBScoreStr === null) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    const teamAScore = parseInt(teamAScoreStr as string, 10);
    const teamBScore = parseInt(teamBScoreStr as string, 10);

    if (isNaN(matchId) || isNaN(teamAScore) || isNaN(teamBScore)) {
      return { success: false, message: "Invalid values" };
    }

    try {
      await updateMatchScore(db, matchId, teamAScore, teamBScore);
      return { success: true, message: "Score updated" };
    } catch (error) {
      console.error("Error updating match score:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update score",
      };
    }
  }

  if (intent === "delete-match") {
    const matchIdStr = formData.get("matchId");

    if (!matchIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    if (isNaN(matchId)) {
      return { success: false, message: "Invalid match ID" };
    }

    try {
      await deleteMatch(db, matchId);
      return { success: true, message: "Match deleted" };
    } catch (error) {
      console.error("Error deleting match:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete match",
      };
    }
  }

  if (intent === "update-match-order") {
    const matchIdStr = formData.get("matchId");
    const direction = formData.get("direction") as "up" | "down";
    const currentOrderStr = formData.get("currentOrder");

    if (!matchIdStr || !direction || !currentOrderStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchId = parseInt(matchIdStr as string, 10);
    const currentOrder = parseInt(currentOrderStr as string, 10);

    if (isNaN(matchId) || isNaN(currentOrder)) {
      return { success: false, message: "Invalid values" };
    }

    const newOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;

    try {
      await updateMatchOrder(db, matchId, newOrder);
      return { success: true, message: "Match order updated" };
    } catch (error) {
      console.error("Error updating match order:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update match order",
      };
    }
  }

  if (intent === "update-match-day-order") {
    const matchDayIdStr = formData.get("matchDayId");
    const direction = formData.get("direction") as "up" | "down";
    const currentOrderStr = formData.get("currentOrder");

    if (!matchDayIdStr || !direction || !currentOrderStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const matchDayId = parseInt(matchDayIdStr as string, 10);
    const currentOrder = parseInt(currentOrderStr as string, 10);

    if (isNaN(matchDayId) || isNaN(currentOrder)) {
      return { success: false, message: "Invalid values" };
    }

    const newOrder = direction === "up" ? currentOrder - 1 : currentOrder + 1;

    try {
      await updateMatchDayOrder(db, matchDayId, newOrder);
      return { success: true, message: "Match day order updated" };
    } catch (error) {
      console.error("Error updating match day order:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update match day order",
      };
    }
  }

  if (intent === "bulk-import-matches") {
    const jsonData = formData.get("jsonData") as string;

    if (!jsonData) {
      return { success: false, message: "No JSON data provided" };
    }

    let parsed: BulkImportData;
    try {
      parsed = JSON.parse(jsonData);
    } catch {
      return { success: false, message: "Invalid JSON format" };
    }

    // Get all users and teams for lookup
    const allTeams = await db.query.teams.findMany({
      with: { user: true },
    });

    // Build a map of user name (lowercase) -> team
    const userNameToTeam = new Map<string, { id: number; name: string }>();
    for (const team of allTeams) {
      if (team.user) {
        userNameToTeam.set(team.user.name.toLowerCase(), {
          id: team.id,
          name: team.name,
        });
      }
    }

    // Validate all user names first
    const errors: string[] = [];
    for (const [matchDayName, matchList] of Object.entries(parsed)) {
      for (const [userA, userB] of matchList) {
        if (!userNameToTeam.has(userA.toLowerCase())) {
          errors.push(`Unknown user "${userA}" in ${matchDayName}`);
        }
        if (!userNameToTeam.has(userB.toLowerCase())) {
          errors.push(`Unknown user "${userB}" in ${matchDayName}`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: `Validation errors:\n${errors.join("\n")}`,
      };
    }

    // Create match days and matches
    try {
      let matchDaysCreated = 0;
      let matchesCreated = 0;

      for (const [matchDayName, matchList] of Object.entries(parsed)) {
        // Create match day with null date
        const matchDay = await createMatchDay(db, matchDayName, null);
        matchDaysCreated++;

        // Create matches for this match day
        for (const [userA, userB] of matchList) {
          const teamA = userNameToTeam.get(userA.toLowerCase())!;
          const teamB = userNameToTeam.get(userB.toLowerCase())!;

          await createMatch(db, {
            teamAId: teamA.id,
            teamBId: teamB.id,
            matchDayId: matchDay.id,
          });
          matchesCreated++;
        }
      }

      return {
        success: true,
        message: `Successfully created ${matchDaysCreated} match days with ${matchesCreated} matches`,
      };
    } catch (error) {
      console.error("Error bulk importing matches:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to bulk import matches",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

function MatchDayRow({
  matchDay,
  teams,
  locations,
  index,
  totalMatchDays,
}: {
  matchDay: {
    id: number;
    name: string | null;
    date: Date | null;
    orderInSeason: number | null;
    matches: Array<{
      id: number;
      orderInDay: number | null;
      state: MatchState;
      teamAScore: number | null;
      teamBScore: number | null;
      scheduledDate: Date | null;
      locationId: number | null;
      location: { id: number; name: string } | null;
      teamA: {
        id: number;
        name: string;
        user: { id: number; name: string } | null;
      };
      teamB: {
        id: number;
        name: string;
        user: { id: number; name: string } | null;
      };
    }>;
  };
  teams: Array<{
    id: number;
    name: string;
    user: { id: number; name: string } | null;
  }>;
  locations: Array<{ id: number; name: string }>;
  index: number;
  totalMatchDays: number;
}) {
  const fetcher = useFetcher();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(matchDay.name || "");
  const [expanded, setExpanded] = useState(false);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getTeamDisplay = (team: {
    id: number;
    name: string;
    user: { id: number; name: string } | null;
  }) => {
    return team.user ? `${team.name} (${team.user.name})` : team.name;
  };

  const handleNameSave = () => {
    if (name !== matchDay.name) {
      fetcher.submit(
        {
          intent: "update-match-day",
          matchDayId: matchDay.id.toString(),
          name: name,
        },
        { method: "post" },
      );
    }
    setEditingName(false);
  };

  const handleDateChange = (newDate: string) => {
    fetcher.submit(
      {
        intent: "update-match-day",
        matchDayId: matchDay.id.toString(),
        date: newDate,
      },
      { method: "post" },
    );
  };

  return (
    <div className="border rounded bg-cell-gray/40 border-cell-gray/50">
      <div
        className="flex items-center gap-4 p-3 cursor-pointer hover:bg-cell-gray/60 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg">{expanded ? "▼" : "▶"}</span>
        <div className="flex-1">
          {editingName ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSave();
                if (e.key === "Escape") {
                  setName(matchDay.name || "");
                  setEditingName(false);
                }
              }}
              className="px-2 py-1 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Match day name"
              autoFocus
            />
          ) : (
            <span
              className="font-semibold hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setEditingName(true);
              }}
              title="Click to edit name"
            >
              {matchDay.name || "Unnamed Match Day"}
            </span>
          )}
          <span className="text-sm text-gray-400 ml-2">
            ({matchDay.matches.length}{" "}
            {matchDay.matches.length === 1 ? "match" : "matches"})
          </span>
        </div>
        <input
          type="date"
          value={
            matchDay.date
              ? new Date(matchDay.date).toISOString().split("T")[0]
              : ""
          }
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleDateChange(e.target.value)}
          className="px-2 py-1 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">
          {matchDay.date ? formatDate(matchDay.date) : "No date set"}
        </span>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="update-match-day-order" />
            <input type="hidden" name="matchDayId" value={matchDay.id} />
            <input type="hidden" name="direction" value="up" />
            <input
              type="hidden"
              name="currentOrder"
              value={matchDay.orderInSeason ?? index + 1}
            />
            <button
              type="submit"
              disabled={index === 0}
              className={`px-2 py-1 rounded text-sm ${
                index === 0
                  ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              ▲
            </button>
          </Form>
          <Form method="post" className="inline-block">
            <input type="hidden" name="intent" value="update-match-day-order" />
            <input type="hidden" name="matchDayId" value={matchDay.id} />
            <input type="hidden" name="direction" value="down" />
            <input
              type="hidden"
              name="currentOrder"
              value={matchDay.orderInSeason ?? index + 1}
            />
            <button
              type="submit"
              disabled={index === totalMatchDays - 1}
              className={`px-2 py-1 rounded text-sm ${
                index === totalMatchDays - 1
                  ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              ▼
            </button>
          </Form>
        </div>
        <Form
          method="post"
          className="inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          <input type="hidden" name="intent" value="delete-match-day" />
          <input type="hidden" name="matchDayId" value={matchDay.id} />
          <input
            type="hidden"
            name="matchDayName"
            value={matchDay.name || ""}
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
          >
            Delete
          </button>
        </Form>
      </div>

      {expanded && (
        <div className="border-t border-cell-gray/50 p-4 space-y-4">
          {/* Matches List */}
          {matchDay.matches.length > 0 && (
            <div className="space-y-2">
              {matchDay.matches.map((match, index) => (
                <div
                  key={match.id}
                  className="flex items-center gap-4 p-3 bg-cell-gray/30 rounded"
                >
                  <span className="text-sm text-gray-400 w-6">
                    #{match.orderInDay ?? index + 1}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">
                      {getTeamDisplay(match.teamA)} vs{" "}
                      {getTeamDisplay(match.teamB)}
                    </div>
                    {match.scheduledDate && (
                      <div className="text-sm text-gray-400">
                        {formatTime(match.scheduledDate)}
                      </div>
                    )}
                  </div>

                  {/* Location selector */}
                  <fetcher.Form
                    method="post"
                    className="flex items-center gap-1"
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value="update-match-location"
                    />
                    <input type="hidden" name="matchId" value={match.id} />
                    <select
                      name="locationId"
                      defaultValue={match.locationId ?? ""}
                      onChange={(e) => e.target.form?.requestSubmit()}
                      className="px-2 py-1 rounded border border-cell-gray bg-cell-gray/60 text-sm max-w-[180px]"
                    >
                      <option value="">No location</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {formatLocationName(loc.name)}
                        </option>
                      ))}
                    </select>
                  </fetcher.Form>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        match.state === "upcoming"
                          ? "bg-blue-600"
                          : match.state === "live"
                            ? "bg-green-600"
                            : "bg-gray-600"
                      }`}
                    >
                      {match.state}
                    </span>
                    {match.teamAScore !== null && (
                      <span className="text-sm font-semibold">
                        {match.teamAScore} - {match.teamBScore}
                      </span>
                    )}
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex gap-1">
                    <Form method="post" className="inline-block">
                      <input
                        type="hidden"
                        name="intent"
                        value="update-match-order"
                      />
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="direction" value="up" />
                      <input
                        type="hidden"
                        name="currentOrder"
                        value={match.orderInDay ?? index + 1}
                      />
                      <button
                        type="submit"
                        disabled={index === 0}
                        className={`px-2 py-1 rounded text-sm ${
                          index === 0
                            ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}
                      >
                        ▲
                      </button>
                    </Form>
                    <Form method="post" className="inline-block">
                      <input
                        type="hidden"
                        name="intent"
                        value="update-match-order"
                      />
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="direction" value="down" />
                      <input
                        type="hidden"
                        name="currentOrder"
                        value={match.orderInDay ?? index + 1}
                      />
                      <button
                        type="submit"
                        disabled={index === matchDay.matches.length - 1}
                        className={`px-2 py-1 rounded text-sm ${
                          index === matchDay.matches.length - 1
                            ? "bg-gray-500 text-gray-300 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        ▼
                      </button>
                    </Form>
                  </div>

                  {/* State and score controls */}
                  <fetcher.Form
                    method="post"
                    className="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value="update-match-state"
                    />
                    <input type="hidden" name="matchId" value={match.id} />
                    <select
                      name="state"
                      defaultValue={match.state}
                      onChange={(e) => e.target.form?.requestSubmit()}
                      className="px-2 py-1 rounded border border-cell-gray bg-cell-gray/60 text-sm"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="finished">Finished</option>
                    </select>
                  </fetcher.Form>

                  {(match.state === "live" || match.state === "finished") && (
                    <fetcher.Form
                      method="post"
                      className="flex items-center gap-1"
                    >
                      <input
                        type="hidden"
                        name="intent"
                        value="update-match-score"
                      />
                      <input type="hidden" name="matchId" value={match.id} />
                      <input
                        type="number"
                        name="teamAScore"
                        defaultValue={match.teamAScore ?? 0}
                        min="0"
                        className="w-12 px-1 py-1 rounded border border-cell-gray bg-cell-gray/60 text-sm text-center"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        name="teamBScore"
                        defaultValue={match.teamBScore ?? 0}
                        min="0"
                        className="w-12 px-1 py-1 rounded border border-cell-gray bg-cell-gray/60 text-sm text-center"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
                      >
                        Save
                      </button>
                    </fetcher.Form>
                  )}

                  <Link
                    to={`/admin/match/${match.id}/stats`}
                    className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm"
                  >
                    Stats
                  </Link>

                  <Form method="post" className="inline-block">
                    <input type="hidden" name="intent" value="delete-match" />
                    <input type="hidden" name="matchId" value={match.id} />
                    <button
                      type="submit"
                      className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm"
                    >
                      ×
                    </button>
                  </Form>
                </div>
              ))}
            </div>
          )}

          {/* Add Match Form */}
          <div className="pt-4 border-t border-cell-gray/30">
            <h4 className="text-sm font-semibold mb-2 text-gray-300">
              Add Match
            </h4>
            <Form method="post" className="flex flex-wrap gap-4 items-end">
              <input type="hidden" name="intent" value="create-match" />
              <input type="hidden" name="matchDayId" value={matchDay.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Team A</label>
                <select
                  name="teamAId"
                  required
                  className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select team...</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {getTeamDisplay(team)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Team B</label>
                <select
                  name="teamBId"
                  required
                  className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select team...</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {getTeamDisplay(team)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">
                  Location (optional)
                </label>
                <select
                  name="locationId"
                  className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {formatLocationName(loc.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Time (optional)</label>
                <input
                  type="time"
                  name="scheduledTime"
                  className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Add Match
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkImportSection() {
  const [expanded, setExpanded] = useState(false);
  const [jsonData, setJsonData] = useState("");
  const fetcher = useFetcher();

  const exampleJson = `{
  "Matchday 1": [
    ["UserA", "UserB"],
    ["UserC", "UserD"]
  ],
  "Matchday 2": [
    ["UserA", "UserC"],
    ["UserB", "UserD"]
  ]
}`;

  return (
    <div className="border rounded bg-cell-gray/40 border-cell-gray/50">
      <div
        className="flex items-center gap-4 p-3 cursor-pointer hover:bg-cell-gray/60 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg">{expanded ? "▼" : "▶"}</span>
        <h2 className="text-xl font-semibold">Bulk Import Matches</h2>
      </div>

      {expanded && (
        <div className="border-t border-cell-gray/50 p-4 space-y-4">
          <p className="text-sm text-gray-400">
            Paste JSON with match day names as keys and arrays of user name
            pairs as values. Match days will be created without dates (add them
            later).
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
              Show example format
            </summary>
            <pre className="mt-2 p-3 bg-black/30 rounded text-xs overflow-x-auto">
              {exampleJson}
            </pre>
          </details>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="bulk-import-matches" />
            <textarea
              name="jsonData"
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder="Paste JSON here..."
              className="w-full h-64 px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={!jsonData.trim() || fetcher.state !== "idle"}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white transition-colors"
            >
              {fetcher.state !== "idle" ? "Importing..." : "Import Matches"}
            </button>
          </fetcher.Form>
        </div>
      )}
    </div>
  );
}

export default function AdminMatches({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      {actionData?.message && (
        <div
          className={`p-4 rounded whitespace-pre-wrap ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      {/* Bulk Import Section */}
      <BulkImportSection />

      {/* Create Match Day Form */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4">Create Match Day</h2>
        <Form method="post" className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="intent" value="create-match-day" />
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm text-gray-400">
              Name (optional)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Week 1, Finals"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className="text-sm text-gray-400">
              Date
            </label>
            <input
              type="date"
              id="date"
              name="date"
              required
              className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            Create Match Day
          </button>
        </Form>
      </div>

      {/* Match Days List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Match Days</h2>
        {loaderData.matchDays.length === 0 ? (
          <p className="text-gray-200">No match days created yet</p>
        ) : (
          <div className="space-y-2">
            {loaderData.matchDays.map((matchDay, index) => (
              <MatchDayRow
                key={matchDay.id}
                matchDay={matchDay}
                teams={loaderData.teams}
                locations={loaderData.locations}
                index={index}
                totalMatchDays={loaderData.matchDays.length}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
