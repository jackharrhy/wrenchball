import { redirect, Form } from "react-router";
import type { Route } from "./+types/admin.users";
import { requireUser, impersonateUser } from "~/auth.server";
import { db } from "~/database/db";
import { users, teams } from "~/database/schema";
import { asc, eq } from "drizzle-orm";
import { createUser, deleteUser } from "~/utils/admin.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      discordSnowflake: users.discordSnowflake,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(users)
    .leftJoin(teams, eq(teams.userId, users.id))
    .orderBy(asc(users.name));

  return {
    user,
    users: allUsers,
  };
}

export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const clonedRequest = request.clone();
  const formData = await clonedRequest.formData();
  const intent = formData.get("intent");

  if (intent === "delete-user") {
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to delete user "${userName}"? This will also delete their team and unassign all their players.`,
    );
    if (!confirmed) {
      return { success: false, message: "Action cancelled" };
    }
  }

  if (intent === "impersonate") {
    const userName = formData.get("userName");
    const confirmed = confirm(
      `Are you sure you want to impersonate "${userName}"?`,
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

  if (intent === "create-user") {
    const name = formData.get("name") as string;
    const role = formData.get("role") as "admin" | "user";
    const discordSnowflake = formData.get("discordSnowflake") as string;

    if (!name || !role || !discordSnowflake) {
      return { success: false, message: "Missing required fields" };
    }

    try {
      await createUser(db, name, role, discordSnowflake);
      return { success: true, message: `Created user "${name}"` };
    } catch (error) {
      console.error("Error creating user:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create user",
      };
    }
  }

  if (intent === "delete-user") {
    const userIdStr = formData.get("userId");

    if (!userIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const userId = parseInt(userIdStr as string, 10);
    if (isNaN(userId)) {
      return { success: false, message: "Invalid user ID" };
    }

    // Prevent deleting yourself
    if (userId === user.id) {
      return { success: false, message: "You cannot delete yourself" };
    }

    try {
      await deleteUser(db, userId);
      return { success: true, message: "User deleted" };
    } catch (error) {
      console.error("Error deleting user:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete user",
      };
    }
  }

  if (intent === "impersonate") {
    const targetUserIdStr = formData.get("userId");

    if (!targetUserIdStr) {
      return { success: false, message: "Invalid parameters" };
    }

    const targetUserId = parseInt(targetUserIdStr as string, 10);
    if (isNaN(targetUserId)) {
      return { success: false, message: "Invalid user ID" };
    }

    try {
      await impersonateUser(request, targetUserId);
      // impersonateUser will throw a redirect on success
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.error("Error impersonating user:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to impersonate user",
      };
    }
  }

  return { success: false, message: "Invalid action" };
}

export default function AdminUsers({
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

      {/* Create User Form */}
      <div className="border rounded p-4 bg-cell-gray/40 border-cell-gray/50">
        <h2 className="text-xl font-semibold mb-4">Create User</h2>
        <Form method="post" className="flex flex-wrap gap-4 items-end">
          <input type="hidden" name="intent" value="create-user" />
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
              placeholder="User name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="discordSnowflake" className="text-sm text-gray-400">
              Discord Snowflake
            </label>
            <input
              type="text"
              id="discordSnowflake"
              name="discordSnowflake"
              required
              className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Discord ID"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm text-gray-400">
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue="user"
              className="px-3 py-2 rounded border border-cell-gray bg-cell-gray/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            Create User
          </button>
        </Form>
      </div>

      {/* User List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Users</h2>
        {loaderData.users.length === 0 ? (
          <p className="text-gray-200">No users found</p>
        ) : (
          <div className="space-y-2">
            {loaderData.users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-4 p-3 border rounded bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${u.role === "admin" ? "bg-purple-600" : "bg-gray-600"}`}
                    >
                      {u.role}
                    </span>
                    {u.id === loaderData.user.id && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-600">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    Discord: {u.discordSnowflake}
                    {u.teamName && (
                      <>
                        {" "}
                        · Team: <span className="text-gray-200">{u.teamName}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {u.id !== loaderData.user.id && (
                    <>
                      <Form method="post" className="inline-block">
                        <input type="hidden" name="intent" value="impersonate" />
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="userName" value={u.name} />
                        <button
                          type="submit"
                          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
                        >
                          Impersonate
                        </button>
                      </Form>
                      <Form method="post" className="inline-block">
                        <input type="hidden" name="intent" value="delete-user" />
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="userName" value={u.name} />
                        <button
                          type="submit"
                          className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
                        >
                          Delete
                        </button>
                      </Form>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

