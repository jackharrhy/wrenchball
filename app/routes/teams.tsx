import type { Route } from "./+types/teams";
import { Link, Outlet, useLocation } from "react-router";
import { cn } from "~/utils/cn";

export default function Teams({}: Route.ComponentProps) {
  const location = useLocation();
  const isLineups = location.pathname === "/teams";
  const isNames = location.pathname === "/teams/names";

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex gap-2 shrink-0">
        <Link
          to="/teams"
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors",
            isLineups
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Lineups
        </Link>
        <Link
          to="/teams/names"
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors",
            isNames
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Names
        </Link>
      </div>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
