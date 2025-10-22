import type { Player } from "~/database/schema";
import { cn } from "~/utils/cn";

export function PlayerIcon({
  player,
  size = "md",
}: {
  player?: Pick<Player, "imageUrl" | "name"> | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const imageUrl =
    player?.imageUrl ?? "/images/players/sideview/right/mario.png";
  const alt = player?.name ?? "Blank Player";

  const sizeClasses = {
    sm: "w-[1.5rem] h-[1.5rem]",
    md: "w-[2rem] h-[2rem]",
    lg: "w-[3rem] h-[3rem]",
    xl: "w-[5rem] h-[5rem]",
  };

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={cn(
        sizeClasses[size],
        "object-fit drop-shadow-sm",
        player === null && "filter brightness-0 opacity-20"
      )}
      onMouseOver={(event)=>{document.body.dataset.player=player?.name}}
      onMouseLeave={(event)=>{delete document.body.dataset.player}}
      data-player={player?.name}
    />
  );
}
