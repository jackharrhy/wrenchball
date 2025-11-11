import type { Route } from "./+types/account";
import { requireUser } from "~/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  return { user };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <p>logged in as: {loaderData.user.name}</p>
      <p>role: {loaderData.user.role}</p>
    </div>
  );
}
