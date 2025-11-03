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

const DraftingIndicator = ({
  currentDraftingUserName,
}: {
  currentDraftingUserName: string | null;
}) => {
  return (
    <div>
      {currentDraftingUserName
        ? `${currentDraftingUserName} is drafting`
        : "Drafting state active, but no user is currently drafting"}
    </div>
  );
};

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
    <>
      <DraftingIndicator
        currentDraftingUserName={loaderData.currentDraftingUserName}
      />
      <div className="drafting-container">
        <div className="search flex flex-col gap-2 items-center justify-center pr-3">
          <input
            name="search"
            type="text"
            placeholder="Search players"
            className="w-full border border-cell-gray/50 outline-none focus:ring-1 ring-cell-gray/70 rounded-md p-2 bg-transparent"
          />
        </div>
        <div className="stats bg-green-500"></div>
        <div className="free-agents bg-blue-500"></div>
        <div className="drafting bg-yellow-500"></div>
      </div>
    </>
  );
}
