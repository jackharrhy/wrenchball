import type { Player } from "~/database/schema";
import { cn } from "~/utils/cn";

export function PlayerIcon({
  player,
  size = "md",
  isCaptain = false,
  isStarred = false,
  isQuestionMark = false,
  className,
}: {
  player?: Pick<Player, "imageUrl" | "name" | "statsCharacter"> | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  isStarred?: boolean;
  isQuestionMark?: boolean;
  isCaptain?: boolean;
  className?: string;
}) {
  let imageUrl = "/images/players/sideview/right/mario.png";
  if (isQuestionMark) {
    imageUrl = "/images/questionmark.webp";
  } else if (player?.imageUrl) {
    imageUrl = player.imageUrl;
  }
  const alt = player?.name ?? "Blank Player";

  const sizeClasses = {
    xs: "w-[1rem] h-[1rem]",
    sm: "w-[1.5rem] h-[1.5rem]",
    md: "w-[2rem] h-[2rem]",
    lg: "w-[3rem] h-[3rem]",
    xl: "w-[5rem] h-[5rem]",
  };

  const starSizeClasses = {
    xs: "text-[6px] pl-0.5",
    sm: "text-[8px] pl-0.5",
    md: "text-[10px] px-[0.15rem]",
    lg: "text-xs px-[0.15rem]",
    xl: "text-sm px-[0.15rem]",
  };

  const captainSizeClasses = {
    xs: "text-[6px] w-2 h-2",
    sm: "text-[8px] w-3 h-3",
    md: "text-[10px] w-3.5 h-3.5",
    lg: "text-xs w-4 h-4",
    xl: "text-sm w-5 h-5",
  };

  return (
    <div
      className={cn("relative shrink-0", sizeClasses[size], className)}
      data-player={player?.statsCharacter}
    >
      <img
        src={imageUrl}
        alt={alt}
        className={cn(
          "object-fit drop-shadow-sm h-full w-full",
          player === null && "filter brightness-0 opacity-20",
        )}
        onMouseOver={(event) => {
          if (!player?.statsCharacter) return;

          document.body.dataset.player = player?.statsCharacter;
        }}
        onMouseLeave={(event) => {
          delete document.body.dataset.player;
        }}
      />
      {isCaptain && (
        <div
          className={cn(
            "absolute -top-1 -left-1 bg-red-500/40 text-white/60 flex items-center justify-center rounded-full font-bold pointer-events-none select-none",
            captainSizeClasses[size],
          )}
        >
          C
        </div>
      )}
      {isStarred && (
        <div
          className={cn(
            "absolute -top-1 -right-1 bg-yellow-400/20 text-black flex items-center justify-center rounded-full font-semibold pointer-events-none select-none",
            starSizeClasses[size],
          )}
        >
          ⭐
        </div>
      )}
      <span className="opacity-0 transition-opacity duration-200 absolute -right-2 bottom-[-0.7rem] text-pink-100 drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] text-[1.4em] font-bold pointer-events-none select-none animate-[wiggle_0.5s_infinite]">
        ♪
      </span>
    </div>
  );
}
