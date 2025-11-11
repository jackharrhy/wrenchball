import { redirect } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/admin-match-track";
import { requireUser } from "~/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  if (user.role !== "admin") {
    throw redirect("/");
  }

  return {};
}

export default function AdminMatchTrack({}: Route.ComponentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const player = new (window as any).YT.Player("player", {
      videoId: "a54JRtqMXfs",
      events: {
        onReady: () => {
          setInterval(() => {
            setCurrentTime(player.getCurrentTime());
          }, 250);
        },
      },
    });
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold">Match Track</h1>
      <p>
        EXTREMELY WORK IN PROGRESS! If you navigate away from the page, it will
        break the website, this is a proof of concept.
      </p>
      <div ref={ref} id="player" className="w-full"></div>
      <div>
        <p>Current Time: {currentTime}</p>
      </div>
    </>
  );
}
