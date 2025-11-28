import type { FieldingPosition, Player, TeamLineup } from "~/database/schema";
import { PlayerIcon } from "./PlayerIcon";
import { Link } from "react-router";
import { TeamLogo } from "./TeamLogo";

const Position = ({
  position,
  players,
  captainId,
}: {
  position: FieldingPosition;
  players: (Player & { lineup?: TeamLineup })[];
  captainId?: number | null;
}) => {
  const player = players.find(
    (player) => player.lineup?.fieldingPosition === position,
  );

  let offset = "";
  switch (position) {
    case "LF":
      offset = "translate-y-8";
      break;
    case "RF":
      offset = "translate-y-8";
      break;
    case "SS":
      offset = "-translate-x-4";
      break;
    case "2B":
      offset = "translate-x-4";
      break;
  }

  const isCaptain =
    captainId !== null && captainId !== undefined && player?.id === captainId;

  return (
    <div
      className={`field-${position.toLowerCase()} flex relative flex-col gap-0.5 items-center justify-center ${offset}`}
    >
      {player ? (
        <Link to={`/player/${player.id}`} className="group">
          <svg
            viewBox="0 0 40 40"
            className="absolute top-0 left-0 z-0 opacity-10 group-hover:opacity-20"
          >
            <circle cx={20} cy={20} r={20} fill="white" />
          </svg>
          <PlayerIcon
            player={player}
            isStarred={player.lineup?.isStarred ?? false}
            isCaptain={isCaptain}
          />
        </Link>
      ) : (
        <>
          <svg viewBox="0 0 40 40" className="absolute top-0 left-0 z-0">
            <circle cx={20} cy={20} r={20} fill="white" fillOpacity={0.2} />
          </svg>
          <PlayerIcon player={null} />
        </>
      )}
      <span className="text-[0.65rem] opacity-75 translate-y-2">
        {position}
      </span>
    </div>
  );
};

function BattingOrder({
  players,
  captainId,
}: {
  players: (Player & { lineup?: TeamLineup })[];
  captainId?: number | null;
}) {
  // Sort players by batting order, filtering out those without a batting order
  const orderedPlayers = players
    .filter((p) => p.lineup?.battingOrder != null)
    .sort(
      (a, b) => (a.lineup?.battingOrder ?? 0) - (b.lineup?.battingOrder ?? 0),
    );

  if (orderedPlayers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-end gap-1">
      {orderedPlayers.map((player) => {
        const isCaptain =
          captainId !== null &&
          captainId !== undefined &&
          player.id === captainId;

        return (
          <Link
            key={player.id}
            to={`/player/${player.id}`}
            className="flex flex-col items-center gap-1 group"
          >
            <span className="text-xs font-bold text-yellow-300/80 group-hover:text-yellow-300">
              {player.lineup?.battingOrder}
            </span>
            <PlayerIcon
              player={player}
              size="md"
              isStarred={player.lineup?.isStarred ?? false}
              isCaptain={isCaptain}
            />
          </Link>
        );
      })}
    </div>
  );
}

export function Field({
  players,
  captainId,
}: {
  players: (Player & { lineup?: TeamLineup })[];
  captainId?: number | null;
}) {
  return (
    <div className="relative field w-80 h-80 text-center">
      {["LF", "CF", "RF", "SS", "2B", "P", "3B", "1B", "C"].map((position) => (
        <Position
          key={position}
          position={position as FieldingPosition}
          players={players}
          captainId={captainId}
        />
      ))}
      <svg viewBox="-10 -10 310 310" className="absolute -z-10 w-full h-full">
        <path
          d="M 0 130 
            Q 150 -100 300 130 
            L 150 280 
            Z"
          fill="var(--color-white)"
          fillOpacity="0.25"
          stroke="var(--color-blue-900)"
          strokeOpacity="0.25"
          strokeWidth="4"
        />
      </svg>
    </div>
  );
}

export function Lineup({
  players,
  captainId,
  captainStatsCharacter,
}: {
  players: (Player & { lineup?: TeamLineup })[];
  captainId?: number | null;
  captainStatsCharacter?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <TeamLogo size="large" captainStatsCharacter={captainStatsCharacter} />
      <BattingOrder players={players} captainId={captainId} />
      <div className="w-full max-w-md border-t border-cell-gray/30"></div>
      <Field players={players} captainId={captainId} />
    </div>
  );
}
