import type { Route } from "./+types/drafting";
import { database } from "~/database/context";
import { getSeasonState } from "~/utils/admin";
import { users } from "~/database/schema";
import { eq } from "drizzle-orm";

export async function loader({ request }: Route.LoaderArgs) {
  const db = database();
  const seasonState = await getSeasonState(db);

  let currentDraftingUserName: string | null = null;
  if (seasonState?.state === "drafting" && seasonState.currentDraftingUserId) {
    const user = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, seasonState.currentDraftingUserId))
      .limit(1);

    if (user.length > 0) {
      currentDraftingUserName = user[0].name;
    }
  }

  return {
    seasonState: seasonState?.state || null,
    currentDraftingUserName,
  };
}

export default function Drafting({ loaderData }: Route.ComponentProps) {
  if (loaderData.seasonState !== "drafting") {
    return (
      <div>
        Season is in '{loaderData.seasonState || "unknown"}' state, not time for
        drafting
      </div>
    );
  }

  return (
    <div>
      {loaderData.currentDraftingUserName
        ? `${loaderData.currentDraftingUserName} is drafting`
        : "Drafting state active, but no user is currently drafting"}
    </div>
  );
}
