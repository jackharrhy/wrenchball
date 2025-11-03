import { Link, useLocation } from "react-router";
import type { SeasonStateValue, Team, User } from "~/database/schema";

export function Nav({
  user,
  team,
  seasonState,
}: {
  user?: User;
  team?: Team;
  seasonState?: SeasonStateValue;
}) {
  const location = useLocation();

  const isActive = (path: string | string[]) => {
    const paths = Array.isArray(path) ? path : [path];
    return paths.some((p) => {
      if (p === "/") {
        return location.pathname === "/";
      }
      return location.pathname === p || location.pathname.startsWith(p + "/");
    });
  };

  const linkClassName = (path: string | string[], ...classes: string[]) => {
    const baseClasses =
      classes.length > 0 ? classes.join(" ") : "hover:text-gray-200";
    return isActive(path) ? `${baseClasses} underline` : baseClasses;
  };

  return (
    <nav className="border-b border-gray-200 py-4">
      <div className="container mx-auto flex items-center justify-start gap-12 h-full px-4">
        <Link to="/" className="text-xl font-bold font-happiness">
          Lil Slug Crew
        </Link>
        <ul className="flex flex-row items-center gap-8">
          <li>
            <Link to="/" className={linkClassName("/")}>
              Home
            </Link>
          </li>
          <li>
            <Link to="/teams" className={linkClassName(["/teams", "/team"])}>
              Teams
            </Link>
          </li>
          <li>
            <Link
              to="/players"
              className={linkClassName(["/players", "/player"])}
            >
              Players
            </Link>
          </li>
          <li>
            <Link
              to="/matches"
              className={linkClassName(["/matches", "/match"])}
            >
              Matches
            </Link>
          </li>
          {seasonState === "drafting" && (
            <li>
              <Link to="/drafting" className={linkClassName("/drafting")}>
                Drafting
              </Link>
            </li>
          )}
          {seasonState === "playing" && (
            <li>
              <Link to="/trading" className={linkClassName("/trading")}>
                Trading
              </Link>
            </li>
          )}
          {user?.role === "admin" && (
            <li>
              <Link to="/admin" className={linkClassName("/admin")}>
                Admin
              </Link>
            </li>
          )}
          {team !== undefined && (
            <li>
              <Link
                to={`/team/${team.id}`}
                className={linkClassName(`/team/${team.id}`)}
              >
                My Team
              </Link>
            </li>
          )}
          {user !== undefined ? (
            <Link to="/logout" className={linkClassName("/logout")}>
              Logout
            </Link>
          ) : (
            <li>
              <Link to="/login" className={linkClassName("/login")}>
                Login
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
