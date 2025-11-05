import type { Route } from "./+types/return-to-original";
import { returnToOriginalUser } from "~/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return returnToOriginalUser(request);
}

