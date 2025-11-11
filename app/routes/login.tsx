import { redirectToDiscordOauth2Flow } from "~/auth.server";

export async function loader() {
  return redirectToDiscordOauth2Flow();
}
