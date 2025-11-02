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
    <div
      className={cn("relative", sizeClasses[size])}
      data-player={player?.name}
    >
      <img
        src={imageUrl}
        alt={alt}
        className={cn(
          "object-fit drop-shadow-sm h-full w-full",
          player === null && "filter brightness-0 opacity-20"
        )}
        onMouseOver={(event) => {
          document.body.dataset.player = player?.name;
        }}
        onMouseLeave={(event) => {
          delete document.body.dataset.player;
        }}
      />
      <span className="opacity-0 transition-opacity duration-200 absolute right-[-0.5rem] bottom-[-0.7rem] text-pink-300 drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] text-[1.4em] font-bold pointer-events-none select-none animate-[wiggle_0.5s_infinite]">
        ♪
      </span>
    </div>
  );
}
