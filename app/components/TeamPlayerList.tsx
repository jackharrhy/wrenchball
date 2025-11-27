import type { Player, Team } from "~/database/schema";
import { PlayerIcon } from "./PlayerIcon";
import { cn } from "~/utils/cn";
import { Link } from "react-router";

export const TeamPlayer = ({
  player,
  size = "md",
  link = true,
}: {
  player: Player | null;
  size?: "md" | "sm";
  link?: boolean;
}) => {
  if (!player) {
    return (
      <div className="flex items-center gap-4">
        <PlayerIcon player={null} />
        <p
          className={cn(
            "text-xs w-full italic opacity-60",
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          Empty
        </p>
      </div>
    );
  }

  if (link) {
    return (
      <Link
        to={`/player/${player.id}`}
        className="flex items-center gap-4 group"
      >
        <PlayerIcon player={player} />
        <p
          className={cn(
            "text-xs w-full transition-all",
            size === "sm" ? "text-xs" : "text-sm",
            "group-hover:underline",
          )}
        >
          {player.name ?? "Empty"}
        </p>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <PlayerIcon player={player} />
      <p
        className={cn("text-xs w-full", size === "sm" ? "text-xs" : "text-sm")}
      >
        {player.name}
      </p>
    </div>
  );
};

export function TeamPlayerList({
  team,
  size = "md",
  link = true,
}: {
  team: Team & { players: (Player | null)[] };
  size?: "md" | "sm";
  link?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", size === "md" ? "gap-2" : "gap-1.5")}>
      {team.players.map((player, index) => (
        <TeamPlayer
          key={player?.id || index}
          player={player}
          size={size}
          link={link}
        />
      ))}
    </div>
  );
}
