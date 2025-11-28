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
import { getUser, getImpersonationInfo } from "./auth.server";
import { db } from "~/database/db";
import { teams } from "~/database/schema";
import { eq } from "drizzle-orm";
import { getSeasonState } from "./utils/admin.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Lil Slug Crew" },
    { name: "description", content: "Lil Slug Crew: Mario Sluggers League" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <Meta />
        <Links />
      </head>
      <body className="h-full flex flex-col">
        {children}
        <ScrollRestoration />
        <Scripts />
        <script src="https://www.youtube.com/iframe_api"></script>
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const [userResult, seasonStateResult, impersonationInfo] = await Promise.all([
    getUser(request),
    getSeasonState(db),
    getImpersonationInfo(request),
  ]);
  const user = userResult ?? undefined;
  const team =
    user &&
    (await db.query.teams.findFirst({
      where: eq(teams.userId, user.id),
    }));
  const seasonState = seasonStateResult?.state ?? undefined;

  return { user, team, seasonState, impersonationInfo };
}

export default function App({
  loaderData: { user, team, seasonState, impersonationInfo },
}: Route.ComponentProps) {
  return (
    <>
      <div
        className="absolute top-0 w-full h-[70dvh] pointer-events-none -z-10"
        id="bg-gradient"
      />
      <Nav
        user={user}
        team={team}
        seasonState={seasonState}
        impersonationInfo={impersonationInfo}
      />
      <div className="container mx-auto p-8 flex-1 flex flex-col">
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
