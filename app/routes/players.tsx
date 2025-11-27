import type { Route } from "./+types/players";
import { Link, Outlet, useLocation } from "react-router";
import { cn } from "~/utils/cn";

export default function Players({}: Route.ComponentProps) {
  const location = useLocation();
  const isGrid = location.pathname === "/players";
  const isChemistry = location.pathname === "/players/chemistry";
  const isChemistryGraph = location.pathname === "/players/chemistry-graph";

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex gap-2 shrink-0">
        <Link
          to="/players"
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors",
            isGrid
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Grid View
        </Link>
        <Link
          to="/players/chemistry"
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors",
            isChemistry
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Chemistry Table
        </Link>
        <Link
          to="/players/chemistry-graph"
          className={cn(
            "px-4 py-2 rounded border-2 transition-colors",
            isChemistryGraph
              ? "bg-cell-gray/60 border-cell-gray"
              : "bg-cell-gray/40 border-cell-gray/50 hover:bg-cell-gray/60",
          )}
        >
          Chemistry Graph
        </Link>
      </div>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
