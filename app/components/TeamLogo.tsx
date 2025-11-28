import { cn } from "~/utils/cn";

const statsCharacterToTeamSlug = {
  Mario: "fireball",
  Luigi: "knights",
  Peach: "monarchs",
  Daisy: "flowers",
  Yoshi: "eggs",
  Birdo: "bows",
  Wario: "muscles",
  Waluigi: "spitballs",
  Bowser: "monsters",
  "Bowser Jr.": "rookies",
  "Donkey Kong": "wilds",
  "Diddy Kong": "monkeys",
} as const;

export function TeamLogo({
  captainStatsCharacter,
  size = "large",
  className = "",
}: {
  captainStatsCharacter?: string | null;
  size?: "large" | "small";
  className?: string;
}) {
  const sizeClasses = {
    large: "h-12 w-36 mx-auto",
    small: "h-10",
  };

  if (!captainStatsCharacter) {
    return null;
  }

  if (!statsCharacterToTeamSlug.hasOwnProperty(captainStatsCharacter)) {
    throw new Error(
      `Invalid captain stats character: ${captainStatsCharacter}`,
    );
  }

  const logoSrc = `/images/teams/logos/${size}/${statsCharacterToTeamSlug[captainStatsCharacter as keyof typeof statsCharacterToTeamSlug]}.png`;

  return (
    <img
      src={logoSrc}
      alt={captainStatsCharacter}
      className={cn(sizeClasses[size], className)}
    />
  );
}
