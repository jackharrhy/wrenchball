import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin.drafting";
import { requireUser } from "~/auth.server";
import { db } from "~/database/db";
import {
  getSeasonState,
  getDraftingOrder,
  adjustDraftingOrder,
  setCurrentDraftingUser,
} from "~/utils/admin.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const seasonState = await getSeasonState(db);
  const draftingOrder = await getDraftingOrder(db);

  return {
    user,
    seasonState,
    draftingOrder,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "set-current-drafting-user") {
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to set "${userName}" as the current drafting user?`,
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

  if (intent === "adjust-draft-order") {
    const userIdStr = formData.get("userId");
    const direction = formData.get("direction") as "up" | "down";

    if (
      !userIdStr ||
      !direction ||
      (direction !== "up" && direction !== "down")
    ) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await adjustDraftingOrder(db, userId, direction);
      return {
        success: true,
        message: `Draft order updated`,
      };
    } catch (error) {
      console.error("Error adjusting draft order:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to adjust draft order",
      };
    }
  }

  if (intent === "set-current-drafting-user") {
    const userIdStr = formData.get("userId");
    const userName = formData.get("userName");

    if (!userIdStr || !userName) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await setCurrentDraftingUser(db, userId);
      return {
        success: true,
        message: `Set "${userName}" as the current drafting user`,
      };
    } catch (error) {
      console.error("Error setting current drafting user:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to set current drafting user",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

export default function AdminDrafting({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-4">
      {actionData?.message && (
        <div
          className={`p-4 rounded ${actionData.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {actionData.message}
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-2">Drafting Order</h2>
        <p className="text-sm text-gray-400 mb-4">
          Season state:{" "}
          <span className="font-semibold">
            {loaderData.seasonState?.state || "Not set"}
          </span>
        </p>

        {loaderData.draftingOrder.length === 0 ? (
          <p className="text-gray-200">No users in drafting order</p>
        ) : (
          <div className="space-y-2">
            {loaderData.draftingOrder.map((item, index) => (
              <div
                key={item.userId}
                className="flex items-center gap-4 p-2 border rounded bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 transition-colors"
              >
                <span className="font-semibold w-8">{item.draftingTurn}.</span>
                <span className="flex-1 flex items-center gap-2">
                  {item.userName}
                  {loaderData.seasonState?.currentDraftingUserId ===
                    item.userId && (
                    <span className="text-sm italic">(Currently Drafting)</span>
                  )}
                </span>
                <div className="flex gap-4 items-center">
                  {loaderData.seasonState?.state === "drafting" && (
                    <Form method="post" className="inline-block">
                      <input
                        type="hidden"
                        name="intent"
                        value="set-current-drafting-user"
                      />
                      <input type="hidden" name="userId" value={item.userId} />
                      <input
                        type="hidden"
                        name="userName"
                        value={item.userName}
                      />
                      <button
                        type="submit"
                        className={`px-3 py-1 rounded text-sm ${
                          loaderData.seasonState?.currentDraftingUserId ===
                          item.userId
                            ? "bg-blue-700 text-white cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                        disabled={
                          loaderData.seasonState?.currentDraftingUserId ===
                          item.userId
                        }
                      >
                        Set as Drafting
                      </button>
                    </Form>
                  )}
                  <div className="flex gap-2">
                    <Form method="post" className="inline-block">
                      <input
                        type="hidden"
                        name="intent"
                        value="adjust-draft-order"
                      />
                      <input type="hidden" name="userId" value={item.userId} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        className={`px-2 py-1 rounded cursor-pointer ${
                          index === 0
                            ? "bg-gray-500 text-gray-100 cursor-not-allowed"
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
                        value="adjust-draft-order"
                      />
                      <input type="hidden" name="userId" value={item.userId} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={
                          index === loaderData.draftingOrder.length - 1
                        }
                        className={`px-2 py-1 rounded cursor-pointer ${
                          index === loaderData.draftingOrder.length - 1
                            ? "bg-gray-500 text-gray-100 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        ▼
                      </button>
                    </Form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

