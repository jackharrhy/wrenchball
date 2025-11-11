import type { Route } from "./+types/auth-callback";
import { handleDiscordAuthCallback } from "~/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return handleDiscordAuthCallback(request);
}
