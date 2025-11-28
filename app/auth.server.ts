import { eq } from "drizzle-orm";
import { createCookieSessionStorage, redirect } from "react-router";
import { db } from "~/database/db";
import { users } from "~/database/schema";

type SessionData = {
  discordSnowflake: string;
  originalDiscordSnowflake?: string;
};

type SessionFlashData = {
  error: string;
};

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is not set");
}

const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI;

if (!discordClientId || !discordRedirectUri || !discordClientSecret) {
  throw new Error(
    "DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI or DISCORD_CLIENT_SECRET is not set",
  );
}

export const redirectToDiscordOauth2Flow = () => {
  const params = new URLSearchParams({
    client_id: discordClientId,
    redirect_uri: discordRedirectUri,
    response_type: "code",
    scope: "identify",
  });

  return redirect(`https://discord.com/api/oauth2/authorize?${params}`);
};

export async function handleDiscordAuthCallback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing auth code", { status: 400 });
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: discordClientId!,
        client_secret: discordClientSecret!,
        grant_type: "authorization_code",
        code,
        redirect_uri: discordRedirectUri!,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return new Response("Failed to get access token", { status: 400 });
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const discordUser = await userResponse.json();
    const discordId = discordUser.id;

    if (!discordId) {
      return new Response("Failed to get Discord user ID", { status: 400 });
    }

    let user = await db
      .select()
      .from(users)
      .where(eq(users.discordSnowflake, discordId))
      .then((users) => users[0]);

    if (!user) {
      throw new Response("Not permitted to access this application", {
        status: 403,
      });
    }

    return createUserSession(user.discordSnowflake, "/");
  } catch (error) {
    console.error("Auth callback error:", error);
    return new Response("Authentication failed", { status: 500 });
  }
}

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__session",
      domain:
        process.env.NODE_ENV === "production"
          ? process.env.WEBSITE_DOMAIN || "lil-slug-crew.jackharrhy.dev"
          : undefined,
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
      sameSite: "lax",
      secrets: [sessionSecret],
      secure: process.env.NODE_ENV === "production",
    },
  });

export const createUserSession = async (
  discordSnowflake: string,
  redirectTo: string,
) => {
  const session = await getSession();
  session.set("discordSnowflake", discordSnowflake);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};

export const logout = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
};

export const isLoggedIn = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  return session.has("discordSnowflake");
};

export const requireDiscordSnowflake = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));

  const discordSnowflake = session.get("discordSnowflake");

  if (discordSnowflake == null) {
    throw redirect("/login");
  }

  return discordSnowflake;
};

export const requireUser = async (request: Request) => {
  const discordSnowflake = await requireDiscordSnowflake(request);

  if (discordSnowflake == undefined) {
    throw redirect("/login");
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.discordSnowflake, discordSnowflake));

  if (user.length === 0) {
    throw redirect("/login");
  }

  return user[0];
};

export const getUser = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  const discordSnowflake = session.get("discordSnowflake");

  if (discordSnowflake == null) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.discordSnowflake, discordSnowflake));

  if (user.length === 0) {
    return null;
  }

  return user[0];
};

export const impersonateUser = async (
  request: Request,
  targetUserId: number,
) => {
  const currentUser = await requireUser(request);

  if (currentUser.role !== "admin") {
    throw new Error("Only admins can impersonate users");
  }

  const targetUser = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .then((users) => users[0]);

  if (!targetUser) {
    throw new Error("Target user not found");
  }

  const session = await getSession(request.headers.get("Cookie"));
  const originalDiscordSnowflake = session.get("discordSnowflake");

  if (!session.get("originalDiscordSnowflake") && originalDiscordSnowflake) {
    session.set("originalDiscordSnowflake", originalDiscordSnowflake);
  }

  session.set("discordSnowflake", targetUser.discordSnowflake);
  throw redirect("/", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};

export const getImpersonationInfo = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  const originalDiscordSnowflake = session.get("originalDiscordSnowflake");

  if (!originalDiscordSnowflake) {
    return null;
  }

  const originalUser = await db
    .select()
    .from(users)
    .where(eq(users.discordSnowflake, originalDiscordSnowflake))
    .then((users) => users[0]);

  if (!originalUser) {
    return null;
  }

  return {
    originalUserId: originalUser.id,
    originalUserName: originalUser.name,
  };
};

export const returnToOriginalUser = async (request: Request) => {
  const session = await getSession(request.headers.get("Cookie"));
  const originalDiscordSnowflake = session.get("originalDiscordSnowflake");

  if (!originalDiscordSnowflake) {
    throw new Error("No original user found");
  }

  const originalUser = await db
    .select()
    .from(users)
    .where(eq(users.discordSnowflake, originalDiscordSnowflake))
    .then((users) => users[0]);

  if (!originalUser) {
    throw new Error("Original user not found");
  }

  session.set("discordSnowflake", originalDiscordSnowflake);
  session.unset("originalDiscordSnowflake");

  throw redirect("/", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};
