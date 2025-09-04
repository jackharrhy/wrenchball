import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("account", "routes/account.tsx"),
  route("auth/callback", "routes/auth-callback.ts"),
  route("teams", "routes/teams.tsx"),
  route("players", "routes/players.tsx"),
  route("matches", "routes/matches.tsx"),
  route("drafting", "routes/drafting.tsx"),
  route("trading", "routes/trading.tsx"),
  route("chemistry", "routes/chemistry.tsx"),
  route("admin", "routes/admin.tsx"),
  route("kitchen-sink", "routes/kitchen-sink.tsx"),
] satisfies RouteConfig;
