import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import "./chem.css";
import { Nav } from "./components/Nav";
import { getUser } from "./auth.server";
import { database } from "~/database/context";
import { teams } from "~/database/schema";
import { eq } from "drizzle-orm";
import { getSeasonState } from "./utils/admin";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Lil Slug Crew" },
    { name: "description", content: "Lil Slug Crew: Mario Sluggers League" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const [userResult, seasonStateResult] = await Promise.all([
    getUser(request),
    getSeasonState(database()),
  ]);
  const user = userResult ?? undefined;
  const team =
    user &&
    (await database().query.teams.findFirst({
      where: eq(teams.userId, user.id),
    }));
  const seasonState = seasonStateResult ?? undefined;

  return { user, team, seasonState };
}

export default function App({
  loaderData: { user, team, seasonState },
}: Route.ComponentProps) {
  return (
    <>
      <div
        className="absolute top-0 w-full h-[70dvh] pointer-events-none -z-10"
        id="bg-gradient"
      />
      <Nav user={user} team={team} seasonState={seasonState} />
      <div className="container mx-auto py-8">
        <Outlet />
      </div>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
