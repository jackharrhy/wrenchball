import type { Route } from "./+types/logout";
import { logout } from "~/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return logout(request);
}
