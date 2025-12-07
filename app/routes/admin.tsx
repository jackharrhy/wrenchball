import { redirect, Link, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/admin";
import { requireUser } from "~/auth.server";
import { cn } from "~/utils/cn";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  return { user };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();

  const tabs = [
    { path: "/admin/matches", label: "Matches" },
    { path: "/admin/conferences", label: "Conferences" },
    { path: "/admin/users", label: "Users" },
    { path: "/admin/drafting", label: "Drafting" },
    { path: "/admin/debug", label: "Debug" },
  ];

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex gap-2 shrink-0 flex-wrap">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "px-4 py-2 rounded border-2 transition-colors",
                isActive
                  ? "bg-cell-gray/60 border-cell-gray"
                  : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
